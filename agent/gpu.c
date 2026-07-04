/**
 * GPU read functions implementation
 * 
 * Uses NVML for Core temp, utilization, memory, power
 * Uses /dev/mem mmap for Junction (0x0002046C) and VRAM (0x0000E2A8) temps
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <fcntl.h>
#include <unistd.h>
#include <errno.h>
#include <sys/mman.h>
#include <pci/pci.h>
#include <nvml.h>

#include "gpu.h"
#include "logger.h"

#define HOTSPOT_REGISTER_OFFSET 0x0002046C
#define VRAM_REGISTER_OFFSET 0x0000E2A8

static nvmlDevice_t *devices = NULL;
static unsigned int device_count = 0;

int nvml_init(void) {
    nvmlReturn_t result = nvmlInit_v2();
    if (result != NVML_SUCCESS) {
        log_error("NVML init failed: %s", nvmlErrorString(result));
        return -1;
    }
    return 0;
}

void nvml_cleanup(void) {
    if (devices) {
        free(devices);
        devices = NULL;
    }
    nvmlShutdown();
}

unsigned int nvml_get_gpu_count(void) {
    /* Only allocate handles once — device count is static for the lifetime of the daemon */
    if (devices) {
        return device_count;
    }
    nvmlDeviceGetCount_v2(&device_count);
    if (device_count > 0) {
        devices = (nvmlDevice_t *)malloc(device_count * sizeof(nvmlDevice_t));
        if (!devices) {
            log_error("Failed to allocate %u GPU handles", device_count);
            device_count = 0;
            return 0;
        }
        for (unsigned int i = 0; i < device_count; i++) {
            nvmlDeviceGetHandleByIndex(i, &devices[i]);
        }
    }
    return device_count;
}

int nvml_gpu_exists(int index) {
    if (index < 0 || index >= device_count) return 0;
    return 1;
}

void nvml_gpu_info(int index, char *name, double *coreTemp, double *utilization,
                   uint64_t *memoryUsed, uint64_t *memoryTotal, double *powerUsage) {
    nvmlDevice_t device = devices[index];
    
    // GPU name
    char nameBuf[256] = "Unknown";
    nvmlDeviceGetName(device, nameBuf, sizeof(nameBuf));
    if (name) strncpy(name, nameBuf, 255);
    
    // Core temperature
    unsigned int tempC = 0;
    nvmlReturn_t result = nvmlDeviceGetTemperature(device, NVML_TEMPERATURE_GPU, &tempC);
    if (result == NVML_SUCCESS && coreTemp) {
        *coreTemp = (double)tempC;
        log_debug("GPU %d temp: %d\u00b0C", index, tempC);
    } else {
        log_warn("GPU %d: core temp read failed: %s", index, nvmlErrorString(result));
    }
    
    // Utilization
    nvmlUtilization_t util;
    nvmlDeviceGetUtilizationRates(device, &util);
    if (utilization) *utilization = (double)util.gpu;
    
    // Memory
    nvmlMemory_t mem = {0};
    nvmlReturn_t memResult = nvmlDeviceGetMemoryInfo(device, &mem);
    if (memResult == NVML_SUCCESS) {
        if (memoryUsed) *memoryUsed = mem.used;
        if (memoryTotal) *memoryTotal = mem.total;
    } else {
        log_warn("GPU %d: memory info failed: %s", index, nvmlErrorString(memResult));
        if (memoryUsed) *memoryUsed = 0;
        if (memoryTotal) *memoryTotal = 0;
    }
    
    // Power
    unsigned int power = 0;
    nvmlDeviceGetPowerUsage(device, &power);
    if (powerUsage) *powerUsage = power / 1000.0; // milliwatts to watts
}

int nvml_gpu_uuid(int index, char *buf, size_t buf_size) {
    if (index < 0 || index >= (int)device_count) return -1;

    nvmlReturn_t result = nvmlDeviceGetUUID(devices[index], buf, buf_size);
    if (result != NVML_SUCCESS) {
        log_warn("GPU %d: failed to get UUID: %s", index, nvmlErrorString(result));
        return -1;
    }
    return 0;
}

void nvml_read_junction_vram(int index, double *junctionTemp, double *vramTemp) {
    if (junctionTemp) *junctionTemp = 0;
    if (vramTemp) *vramTemp = 0;

    // Get PCI info for this GPU
    nvmlPciInfo_t pci_info;
    nvmlReturn_t result = nvmlDeviceGetPciInfo(devices[index], &pci_info);
    if (result != NVML_SUCCESS) {
        log_warn("GPU %d: failed to get PCI info: %s", index, nvmlErrorString(result));
        return;
    }

    // Initialize PCI access
    struct pci_access *pacc = pci_alloc();
    if (!pacc) {
        log_error("GPU %d: failed to allocate PCI structure", index);
        return;
    }
    pci_init(pacc);
    pci_scan_bus(pacc);

    /* Scan PCI devices to find the matching GPU and its BAR0 base address */
    int checked = 0;
    int fd = -1;
    void *map_base = NULL;
    uint32_t bar0 = 0;

    for (struct pci_dev *dev = pacc->devices; dev; dev = dev->next) {
        checked++;
        pci_fill_info(dev, PCI_FILL_IDENT | PCI_FILL_BASES);

        if ((dev->device_id << 16 | dev->vendor_id) != pci_info.pciDeviceId ||
            (unsigned int)dev->domain != pci_info.domain ||
            dev->bus != pci_info.bus ||
            dev->dev != pci_info.device) {
            continue;
        }

        bar0 = dev->base_addr[0] & 0xFFFFFFFF;

        fd = open("/dev/mem", O_RDWR | O_SYNC);
        if (fd < 0) {
            log_warn("GPU %d: failed to open /dev/mem: %s", index, strerror(errno));
            goto junction_vram_done;
        }

        uint32_t junc_reg_addr = bar0 + HOTSPOT_REGISTER_OFFSET;
        uint32_t junc_base = junc_reg_addr & ~(sysconf(_SC_PAGE_SIZE) - 1);
        map_base = mmap(0, sysconf(_SC_PAGE_SIZE), PROT_READ, MAP_SHARED, fd, junc_base);

        if (map_base == MAP_FAILED) {
            log_warn("GPU %d: failed to mmap /dev/mem (junction): %s", index, strerror(errno));
            close(fd);
            fd = -1;
            goto junction_vram_done;
        }

        /* Junction temperature */
        uint32_t junc_offset = junc_reg_addr - junc_base;
        uint32_t junc_val = *((uint32_t *)((char *)map_base + junc_offset));
        uint32_t junction = (junc_val >> 8) & 0xff;
        log_debug("GPU %d: junction raw=0x%08X temp=%d\u00b0C (bar0=0x%08X offset=%u)",
            index, junc_val, junction, bar0, junc_offset);
        if (junctionTemp) *junctionTemp = junction;

        /* VRAM temperature — separate mmap since it's far from junction */
        munmap(map_base, sysconf(_SC_PAGE_SIZE));
        map_base = NULL;
        close(fd);
        fd = -1;

        uint32_t vram_reg_addr = bar0 + VRAM_REGISTER_OFFSET;
        uint32_t vram_base = vram_reg_addr & ~(sysconf(_SC_PAGE_SIZE) - 1);
        fd = open("/dev/mem", O_RDWR | O_SYNC);
        if (fd < 0) {
            log_warn("GPU %d: failed to open /dev/mem (VRAM): %s", index, strerror(errno));
            goto junction_vram_done;
        }

        map_base = mmap(0, sysconf(_SC_PAGE_SIZE), PROT_READ, MAP_SHARED, fd, vram_base);
        if (map_base == MAP_FAILED) {
            log_warn("GPU %d: failed to mmap /dev/mem (VRAM): %s", index, strerror(errno));
            close(fd);
            fd = -1;
            goto junction_vram_done;
        }

        uint32_t vram_offset = vram_reg_addr - vram_base;
        uint32_t vram_val = *((uint32_t *)((char *)map_base + vram_offset));
        uint32_t vram = (vram_val & 0x00000fff) / 0x20;
        log_debug("GPU %d: VRAM raw=0x%08X temp=%d\u00b0C (bar0=0x%08X offset=%u)",
            index, vram_val, vram, bar0, vram_offset);
        if (vramTemp) *vramTemp = vram;

junction_vram_done:
        if (map_base && map_base != MAP_FAILED) {
            munmap(map_base, sysconf(_SC_PAGE_SIZE));
        }
        if (fd >= 0) {
            close(fd);
        }
        break;
    }

    /* Summary log */
    if (junctionTemp && junctionTemp != 0) {
        log_info("GPU %d: junction=%d\u00b0C vram=%d\u00b0C via /dev/mem (bar0=0x%08X, scanned %d devices)",
            index, (int)*junctionTemp, (int)*vramTemp, bar0, checked);
    } else {
        log_warn("GPU %d: /dev/mem junction/VRAM read failed (scanned %d PCI devices, no match)",
            index, checked);
    }

    pci_cleanup(pacc);
}

void nvml_gpu_fan_speed(int index, int *fanSpeed) {
    if (!nvml_gpu_exists(index)) {
        if (fanSpeed) *fanSpeed = 0;
        return;
    }
    unsigned int speed = 0;
    nvmlReturn_t result = nvmlDeviceGetFanSpeed(devices[index], &speed);
    if (result == NVML_SUCCESS && fanSpeed) {
        *fanSpeed = (int)speed;
    } else {
        if (fanSpeed) *fanSpeed = 0;
    }
}

void nvml_gpu_clocks(int index, int *gpuClockMHz, int *memClockMHz) {
    if (!nvml_gpu_exists(index)) {
        if (gpuClockMHz) *gpuClockMHz = 0;
        if (memClockMHz) *memClockMHz = 0;
        return;
    }
    nvmlDevice_t dev = devices[index];
    
    unsigned int clock = 0;
    nvmlReturn_t result = nvmlDeviceGetClockInfo(dev, NVML_CLOCK_GRAPHICS, &clock);
    if (result == NVML_SUCCESS && gpuClockMHz) {
        *gpuClockMHz = (int)clock;
    } else if (gpuClockMHz) {
        *gpuClockMHz = 0;
    }
    
    clock = 0;
    result = nvmlDeviceGetClockInfo(dev, NVML_CLOCK_MEM, &clock);
    if (result == NVML_SUCCESS && memClockMHz) {
        *memClockMHz = (int)clock;
    } else if (memClockMHz) {
        *memClockMHz = 0;
    }
}

void nvml_gpu_temp_thresholds(int index, int *shutdown, int *slowdown) {
    if (!nvml_gpu_exists(index)) {
        if (shutdown) *shutdown = 0;
        if (slowdown) *slowdown = 0;
        return;
    }
    nvmlDevice_t dev = devices[index];
    
    unsigned int val = 0;
    nvmlReturn_t result = nvmlDeviceGetTemperature(dev, NVML_TEMPERATURE_THRESHOLD_SHUTDOWN, &val);
    if (result == NVML_SUCCESS && shutdown) {
        *shutdown = (int)val;
    } else if (shutdown) {
        *shutdown = 0;
    }
    
    val = 0;
    result = nvmlDeviceGetTemperature(dev, NVML_TEMPERATURE_THRESHOLD_SLOWDOWN, &val);
    if (result == NVML_SUCCESS && slowdown) {
        *slowdown = (int)val;
    } else if (slowdown) {
        *slowdown = 0;
    }
}

void nvml_gpu_power_cap(int index, double *powerCapW) {
    if (!nvml_gpu_exists(index)) {
        if (powerCapW) *powerCapW = 0;
        return;
    }
    unsigned int cap = 0;
    nvmlReturn_t result = nvmlDeviceGetEnforcedPowerLimit(devices[index], &cap);
    if (result == NVML_SUCCESS && powerCapW) {
        *powerCapW = cap / 1000.0; // milliwatts to watts
    } else if (powerCapW) {
        *powerCapW = 0;
    }
}

void nvml_gpu_driver_version(char *buf, size_t buf_size) {
    nvmlReturn_t result = nvmlSystemGetDriverVersion(buf, buf_size);
    if (result != NVML_SUCCESS) {
        strncpy(buf, "Unknown", buf_size - 1);
        buf[buf_size - 1] = '\0';
    }
}

void nvml_gpu_perf_state(int index, int *perfState) {
    if (!nvml_gpu_exists(index)) {
        if (perfState) *perfState = 0;
        return;
    }
    nvmlPstates_t pstate = NVML_PSTATE_12;
    nvmlReturn_t result = nvmlDeviceGetPerformanceState(devices[index], &pstate);
    if (result == NVML_SUCCESS && perfState) {
        *perfState = (int)pstate;
    } else if (perfState) {
        *perfState = 0;
    }
}
