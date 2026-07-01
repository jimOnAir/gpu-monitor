/**
 * GPU board identity discovery implementation
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <fcntl.h>
#include <unistd.h>
#include <errno.h>
#include <nvml.h>

#include "gpu_identity.h"
#include "logger.h"

#define VBIOS_MAX_SIZE 524288  /* 512KB — max VBIOS for modern NVIDIA GPUs */
#define MIN_STRING_LEN 4       /* Minimum ASCII string length to consider */
#define NVML_PART_NUMBER_MAX 64

/* ─── PCI Subsystem Vendor ID → human-readable name ─── */

struct Pcivendor {
    uint16_t id;
    const char *name;
};

static const struct Pcivendor pci_vendors[] = {
    { 0x1043, "ASUSTeK"  },
    { 0x1458, "Gigabyte" },
    { 0x1462, "MSI"      },
    { 0x1569, "Palit"    },
    { 0x1682, "XFX"      },
    { 0x1eae, "XFX"      },  /* XFX alias */
    { 0x172f, "Sparkle"  },
    { 0x1849, "ASRock"   },
    { 0x196e, "PNY"      },
    { 0x1b4c, "GALAX"    },
    { 0x3842, "EVGA"     },
    { 0, NULL }             /* sentinel */
};

const char *lookup_pci_vendor(uint16_t id) {
    for (int i = 0; pci_vendors[i].name; i++) {
        if (pci_vendors[i].id == id) {
            return pci_vendors[i].name;
        }
    }
    return NULL;
}

/* ─── Read PCI bus/device path for an NVML GPU index ─── */

/*
 * Get the PCI path component (e.g. "0000:01:00.0") for a given NVML device index.
 * Writes to buf (must be at least 32 bytes). Returns 0 on success.
 */
static int get_pci_path(int nvml_index, char *buf, size_t buf_size) {
    nvmlDevice_t device;
    nvmlPciInfo_t pci_info;

    if (nvmlDeviceGetHandleByIndex(nvml_index, &device) != NVML_SUCCESS) {
        return -1;
    }

    if (nvmlDeviceGetPciInfo_v3(device, &pci_info) != NVML_SUCCESS) {
        return -1;
    }

    snprintf(buf, buf_size, "%04x:%02x:%02x.0",
             pci_info.domain, pci_info.bus, pci_info.device);
    return 0;
}

/* ─── Layer 2: PCI subsystem vendor from sysfs ─── */

/*
 * Read the PCI subsystem vendor ID from sysfs.
 * Format: "0x1462\n" (ASCII hex, 7 bytes).
 * Returns the raw 16-bit vendor ID, or 0 on failure.
 */
static uint16_t read_pci_subsystem_vendor(int nvml_index) {
    char pci_path[32];
    char sysfs_path[256];
    char buf[16];
    int fd;
    ssize_t nread;
    unsigned long val;

    if (get_pci_path(nvml_index, pci_path, sizeof(pci_path)) != 0) {
        return 0;
    }

    snprintf(sysfs_path, sizeof(sysfs_path),
             "/sys/bus/pci/devices/%s/subsystem_vendor", pci_path);

    fd = open(sysfs_path, O_RDONLY);
    if (fd < 0) {
        log_debug("GPU %d: failed to open %s: %s", nvml_index, sysfs_path, strerror(errno));
        return 0;
    }

    nread = read(fd, buf, sizeof(buf) - 1);
    close(fd);

    if (nread <= 0) {
        return 0;
    }
    buf[nread] = '\0';

    /* Strip the "0x" prefix and parse */
    if (strncmp(buf, "0x", 2) == 0 || strncmp(buf, "0X", 2) == 0) {
        val = strtoul(buf + 2, NULL, 16);
    } else {
        val = strtoul(buf, NULL, 16);
    }

    return (uint16_t)(val & 0xFFFF);
}

/* ─── Layer 1: VBIOS ROM string extraction ─── */

/*
 * Read VBIOS ROM from sysfs and extract board model string.
 * Searches for long ASCII strings containing known GPU series keywords.
 * Writes result into model_buf (up to model_buf_size - 1 chars).
 * Returns 0 on success, -1 on failure.
 */
static int read_vbios_model(int nvml_index, char *model_buf, size_t model_buf_size) {
    char pci_path[32];
    char rom_path[256];
    int fd;
    uint8_t *rom;
    ssize_t rom_size;
    size_t best_start = 0;
    size_t best_len = 0;
    size_t cur_start = 0;
    size_t cur_len = 0;

    if (get_pci_path(nvml_index, pci_path, sizeof(pci_path)) != 0) {
        return -1;
    }

    snprintf(rom_path, sizeof(rom_path), "/sys/bus/pci/devices/%s/rom", pci_path);

    fd = open(rom_path, O_RDONLY);
    if (fd < 0) {
        log_debug("GPU %d: failed to open VBIOS ROM %s: %s",
                  nvml_index, rom_path, strerror(errno));
        return -1;
    }

    rom = (uint8_t *)malloc(VBIOS_MAX_SIZE);
    if (!rom) {
        close(fd);
        return -1;
    }

    rom_size = (ssize_t)read(fd, rom, VBIOS_MAX_SIZE);
    close(fd);

    if (rom_size <= 0) {
        free(rom);
        return -1;
    }

    /*
     * Scan for the longest ASCII string that contains a GPU model keyword.
     * NVIDIA VBIOS typically embeds board model names as ASCII strings.
     */
    static const char *keywords[] = {
        "RTX", "GTX", "GeForce", "TI", "OC",
        NULL
    };

    for (size_t i = 0; i < (size_t)rom_size; i++) {
        unsigned char ch = rom[i];

        if (ch >= 0x20 && ch < 0x7f) {
            if (cur_len == 0) {
                cur_start = i;
            }
            cur_len++;
        } else {
            /* End of printable ASCII sequence — check if it's a good model string */
            if (cur_len >= MIN_STRING_LEN && cur_len > best_len) {
                /* Check if this string contains a GPU keyword */
                int has_keyword = 0;
                for (int k = 0; keywords[k]; k++) {
                    if (strcasestr((char *)(rom + cur_start), keywords[k])) {
                        has_keyword = 1;
                        break;
                    }
                }
                if (has_keyword) {
                    best_start = cur_start;
                    best_len = cur_len;
                }
            }
            cur_len = 0;
        }
    }

    /* Check the final string (if file doesn't end with non-printable) */
    if (cur_len >= MIN_STRING_LEN && cur_len > best_len) {
        int has_keyword = 0;
        for (int k = 0; keywords[k]; k++) {
            if (strcasestr((char *)(rom + cur_start), keywords[k])) {
                has_keyword = 1;
                break;
            }
        }
        if (has_keyword) {
            best_start = cur_start;
            best_len = cur_len;
        }
    }

    if (best_len == 0) {
        free(rom);
        log_debug("GPU %d: no model string found in VBIOS (%zd bytes scanned)", nvml_index, rom_size);
        return -1;
    }

    /* Sanitize the extracted string: keep only printable ASCII */
    size_t out_len = 0;
    for (size_t i = 0; i < best_len && out_len < model_buf_size - 1; i++) {
        unsigned char ch = rom[best_start + i];
        if (ch >= 0x20 && ch < 0x7f) {
            model_buf[out_len++] = (char)ch;
        }
    }
    model_buf[out_len] = '\0';

    free(rom);

    log_debug("GPU %d: VBIOS model string found: \"%s\" (len=%zu)",
              nvml_index, model_buf, best_len);

    return 0;
}

/* ─── Layer 3: NVML board part number ─── */

static void read_nvml_part_number(int nvml_index, char *buf, size_t buf_size) {
    nvmlDevice_t device;
    char nvml_buf[NVML_PART_NUMBER_MAX];

    if (nvmlDeviceGetHandleByIndex(nvml_index, &device) != NVML_SUCCESS) {
        return;
    }

    nvmlReturn_t result = nvmlDeviceGetBoardPartNumber(device, nvml_buf, sizeof(nvml_buf));
    if (result == NVML_SUCCESS && strlen(nvml_buf) > 0) {
        strncpy(buf, nvml_buf, buf_size - 1);
        buf[buf_size - 1] = '\0';
    } else {
        buf[0] = '\0';
    }
}

/* ─── Orchestrator: three-layer fallback ─── */

void discover_gpu_identity(int nvml_index, struct GpuIdentity *out) {
    memset(out, 0, sizeof(*out));

    /* Layer 1: VBIOS ROM string extraction (vendor + model) */
    char vbios_model[128] = {0};
    int vbios_ok = read_vbios_model(nvml_index, vbios_model, sizeof(vbios_model));

    if (vbios_ok == 0 && strlen(vbios_model) > 0) {
        /* Try to extract vendor from PCI subsystem vendor for completeness */
        uint16_t pci_vid = read_pci_subsystem_vendor(nvml_index);
        const char *vendor = lookup_pci_vendor(pci_vid);
        if (vendor) {
            strncpy(out->vendor, vendor, sizeof(out->vendor) - 1);
        }
        strncpy(out->model, vbios_model, sizeof(out->model) - 1);
        log_info("GPU %d: VBIOS identity — %s %s", nvml_index,
                 out->vendor[0] ? out->vendor : "Unknown", out->model);
    }

    /* Layer 2: PCI subsystem vendor (if VBIOS didn't give us vendor) */
    if (out->vendor[0] == '\0') {
        uint16_t pci_vid = read_pci_subsystem_vendor(nvml_index);
        if (pci_vid != 0) {
            const char *vendor = lookup_pci_vendor(pci_vid);
            if (vendor) {
                strncpy(out->vendor, vendor, sizeof(out->vendor) - 1);
                log_debug("GPU %d: PCI sysfs vendor — %s (0x%04x)", nvml_index, vendor, pci_vid);
            } else {
                log_debug("GPU %d: PCI sysfs vendor unknown (0x%04x)", nvml_index, pci_vid);
            }
        }
    }

    /* Layer 3: NVML board part number (always attempted) */
    read_nvml_part_number(nvml_index, out->partNumber, sizeof(out->partNumber));

    if (out->vendor[0] == '\0' && out->model[0] == '\0' && out->partNumber[0] == '\0') {
        log_debug("GPU %d: no board identity discovered", nvml_index);
    }
}
