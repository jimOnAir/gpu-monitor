/**
 * GPU board identity discovery
 *
 * Discovers board vendor, model, and part number for each GPU once at startup.
 * Uses three-layer fallback:
 *   1. VBIOS ROM string extraction (requires root, most accurate)
 *   2. PCI subsystem vendor ID from sysfs (vendor only, no root needed)
 *   3. NVML board part number (always attempted)
 *
 * Results are cached in the GpuData struct — zero overhead during polling.
 */

#ifndef GPU_IDENTITY_H
#define GPU_IDENTITY_H

#include <stdint.h>

/* Board identity data for a single GPU */
struct GpuIdentity {
    char vendor[64];      /* "ASUS", "MSI", "Gigabyte", etc. */
    char model[128];      /* "MAG RTX 3090", "TUF Gaming RTX 3070" */
    char partNumber[64];  /* NVML board part number */
};

/*
 * Discover board identity for GPU at NVML index.
 * Tries VBIOS → PCI sysfs → NVML in order.
 * Writes result into `out`. On failure, all fields are empty strings.
 */
void discover_gpu_identity(int nvml_index, struct GpuIdentity *out);

#endif // GPU_IDENTITY_H
