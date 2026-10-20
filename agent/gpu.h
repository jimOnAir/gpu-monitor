/**
 * GPU read functions - NVML core metrics; Junction/VRAM temps via NVAPI
 * with /dev/mem BAR0 as fallback (Turing-Ampere-Ada register offsets)
 */

#ifndef GPU_H
#define GPU_H

#include <stddef.h>
#include <stdint.h>

struct GpuData {
    int index;
    char uuid[80];
    char name[256];
    double coreTemp;
    double junctionTemp;   /* valid only when junctionTempValid */
    int junctionTempValid;
    double vramTemp;       /* valid only when vramTempValid */
    int vramTempValid;
    double utilization;
    uint64_t memoryUsed;
    uint64_t memoryTotal;
    double powerUsage;
    /* Extended metrics */
    int fanSpeed;           /* 0-100 percent */
    int gpuClockMHz;        /* current shared clock */
    int memClockMHz;        /* current memory clock */
    int tempShutdown;       /* temperature shutdown threshold */
    int tempSlowdown;       /* temperature slowdown threshold */
    double powerCapW;       /* enforced power limit in watts */
    char driverVersion[80]; /* e.g. "550.90.07" */
    int perfState;          /* P-state index (P0=0, P12=12) */
    
    /* Board identity (discovered once at startup, optional) */
    char vendor[64];        /* "ASUS", "MSI", "Gigabyte", etc. */
    char model[128];        /* Board model name from VBIOS */
    char partNumber[64];    /* NVML board part number */
};

// NVML initialization/cleanup
int nvml_init(void);
void nvml_cleanup(void);

// GPU detection
unsigned int nvml_get_gpu_count(void);
int nvml_gpu_exists(int index);

// GPU info from NVML
void nvml_gpu_info(int index, char *name, double *coreTemp, double *utilization,
                   uint64_t *memoryUsed, uint64_t *memoryTotal, double *powerUsage);

// GPU UUID from NVML (writes to buf, returns 0 on success, -1 on failure)
int nvml_gpu_uuid(int index, char *buf, size_t buf_size);

/* Junction/VRAM temps: NVAPI first, /dev/mem BAR0 fallback.
 * Valid flags are cleared when a sensor cannot be read (caller emits null). */
void nvml_read_junction_vram(int index, double *junctionTemp, int *junctionValid,
                             double *vramTemp, int *vramValid);

/* Extended metric queries */
void nvml_gpu_fan_speed(int index, int *fanSpeed);
void nvml_gpu_clocks(int index, int *gpuClockMHz, int *memClockMHz);
void nvml_gpu_temp_thresholds(int index, int *shutdown, int *slowdown);
void nvml_gpu_power_cap(int index, double *powerCapW);
void nvml_gpu_driver_version(char *buf, size_t buf_size);
void nvml_gpu_perf_state(int index, int *perfState);

#endif // GPU_H
