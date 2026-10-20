/**
 * GPU read functions implementation
 *
 * Uses NVML for Core temp, utilization, memory, power
 * Junction/VRAM temps: NVAPI (nvapi_temps.c) first, /dev/mem BAR0 mmap
 * fallback with Turing/Ampere/Ada registers (0x0002046C junction,
 * 0x0000E2A8 VRAM). The BAR0 offsets are dead on Blackwell — NVAPI only.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <dlfcn.h>
#include <fcntl.h>
#include <unistd.h>
#include <errno.h>
#include <sys/mman.h>
#include <pci/pci.h>
#include <nvml.h>

#include "gpu.h"
#include "logger.h"
#include "nvapi_temps.h"

#define HOTSPOT_REGISTER_OFFSET 0x0002046C
#define VRAM_REGISTER_OFFSET 0x0000E2A8

#ifndef NVML_DEVICE_ARCH_BLACKWELL
#define NVML_DEVICE_ARCH_BLACKWELL 10 /* NVML >= 12.8 headers; older headers lack it */
#endif

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

/* nvmlDeviceGetArchitecture is only resolved at runtime (older build headers lack it) */
static int device_is_blackwell(int index) {
    typedef nvmlReturn_t (*get_arch_fn)(nvmlDevice_t, unsigned int *);
    static get_arch_fn get_arch;
    static int resolved;

    if (!resolved) {
        resolved = 1;
        get_arch = (get_arch_fn)dlsym(RTLD_DEFAULT, "nvmlDeviceGetArchitecture");
    }
    if (!get_arch) {
        return 0;
    }
    unsigned int arch = 0;
    if (get_arch(devices[index], &arch) != NVML_SUCCESS) {
        return 0;
    }
    return arch == NVML_DEVICE_ARCH_BLACKWELL;
}

/* Read one BAR0 temperature register via /dev/mem. Returns 1 and sets *out on success. */
static int bar0_read_temp(uint32_t bar0, uint32_t reg_offset, double *out,
                          unsigned int shift, uint32_t mask, double divisor, const char *what) {
    long page = sysconf(_SC_PAGE_SIZE);
    uint32_t reg_addr = bar0 + reg_offset;
    uint32_t map_page = reg_addr & ~((uint32_t)page - 1);
    int fd = open("/dev/mem", O_RDWR | O_SYNC);
    if (fd < 0) {
        log_warn("/dev/mem open failed (%s): %s", what, strerror(errno));
        return 0;
    }
    void *map_base = mmap(0, (size_t)page, PROT_READ, MAP_SHARED, fd, map_page);
    if (map_base == MAP_FAILED) {
        log_warn("/dev/mem mmap failed (%s): %s", what, strerror(errno));
        close(fd);
        return 0;
    }
    uint32_t val = *(volatile uint32_t *)((char *)map_base + (reg_addr - map_page));
    munmap(map_base, (size_t)page);
    close(fd);

    double temp = (double)((val >> shift) & mask) / divisor;
    if (temp <= 0 || temp >= 255) {
        log_debug("BAR0 %s: raw=0x%08X parsed %.0f\u00b0C — out of range", what, val, temp);
        return 0;
    }
    log_debug("BAR0 %s: raw=0x%08X temp=%.0f\u00b0C (bar0=0x%08X)", what, val, temp, bar0);
    *out = temp;
    return 1;
}

/* Locate BAR0 base address of the GPU via libpci. Returns 1 when found. */
static int find_bar0(const nvmlPciInfo_t *pci_info, uint32_t *bar0) {
    struct pci_access *pacc = pci_alloc();
    if (!pacc) {
        log_error("failed to allocate PCI structure");
        return 0;
    }
    pci_init(pacc);
    pci_scan_bus(pacc);

    int found = 0;
    for (struct pci_dev *dev = pacc->devices; dev; dev = dev->next) {
        pci_fill_info(dev, PCI_FILL_IDENT | PCI_FILL_BASES);
        if ((dev->device_id << 16 | dev->vendor_id) != pci_info->pciDeviceId ||
            (unsigned int)dev->domain != pci_info->domain ||
            dev->bus != pci_info->bus ||
            dev->dev != pci_info->device) {
            continue;
        }
        *bar0 = dev->base_addr[0] & 0xFFFFFFFF;
        found = 1;
        break;
    }
    pci_cleanup(pacc);
    return found;
}

void nvml_read_junction_vram(int index, double *junctionTemp, int *junctionValid,
                             double *vramTemp, int *vramValid) {
    if (junctionTemp) *junctionTemp = 0;
    if (junctionValid) *junctionValid = 0;
    if (vramTemp) *vramTemp = 0;
    if (vramValid) *vramValid = 0;

    /* PCI info: bus number for NVAPI, full BDF for the BAR0 fallback */
    nvmlPciInfo_t pci_info;
    nvmlReturn_t result = nvmlDeviceGetPciInfo(devices[index], &pci_info);
    if (result != NVML_SUCCESS) {
        log_warn("GPU %d: failed to get PCI info: %s", index, nvmlErrorString(result));
        return;
    }

    /* 1) NVAPI: therm channels + Blackwell aggregated hotspot register */
    if (nvapi_temps_supported()) {
        NvapiTemps temps;
        if (nvapi_read_temps((unsigned int)pci_info.bus, device_is_blackwell(index), &temps) == 0) {
            if (junctionTemp) *junctionTemp = temps.junction;
            if (junctionValid) *junctionValid = temps.junctionValid;
            if (vramTemp) *vramTemp = temps.vram;
            if (vramValid) *vramValid = temps.vramValid;
        }
    }

    /* 2) Legacy /dev/mem BAR0 fallback for any metric NVAPI could not provide */
    int junction_missing = junctionValid && !*junctionValid;
    int vram_missing = vramValid && !*vramValid;
    if (junction_missing || vram_missing) {
        uint32_t bar0 = 0;
        if (find_bar0(&pci_info, &bar0)) {
            if (junction_missing) {
                *junctionValid = bar0_read_temp(bar0, HOTSPOT_REGISTER_OFFSET,
                    junctionTemp, 8, 0xff, 1, "junction");
            }
            if (vram_missing) {
                *vramValid = bar0_read_temp(bar0, VRAM_REGISTER_OFFSET,
                    vramTemp, 0, 0xfff, 32, "VRAM");
            }
        } else {
            log_debug("GPU %d: no PCI BAR0 match for legacy junction/VRAM fallback", index);
        }
    }

    if ((junctionValid && *junctionValid) || (vramValid && *vramValid)) {
        log_debug("GPU %d: junction=%d\u00b0C(%s) vram=%d\u00b0C(%s)", index,
            (junctionValid && *junctionValid) ? (int)*junctionTemp : 0,
            (junctionValid && *junctionValid) ? "ok" : "n/a",
            (vramValid && *vramValid) ? (int)*vramTemp : 0,
            (vramValid && *vramValid) ? "ok" : "n/a");
    } else {
        log_warn("GPU %d: junction/VRAM unavailable via NVAPI and /dev/mem", index);
    }
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
