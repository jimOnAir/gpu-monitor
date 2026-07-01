/**
 * GPU read functions - NVML + /dev/mem for Junction/VRAM temps
 */

#ifndef GPU_H
#define GPU_H

#include <stdint.h>

struct GpuData {
    int index;
    char uuid[80];
    char name[256];
    double coreTemp;
    double junctionTemp;
    double vramTemp;
    double utilization;
    uint64_t memoryUsed;
    uint64_t memoryTotal;
    double powerUsage;
    const char *coreStatus;
    const char *junctionStatus;
    const char *vramStatus;
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

// Junction/VRAM temps from /dev/mem (may fail if mmap not available)
void nvml_read_junction_vram(int index, double *junctionTemp, double *vramTemp);

/* Extended metric queries */
void nvml_gpu_fan_speed(int index, int *fanSpeed);
void nvml_gpu_clocks(int index, int *gpuClockMHz, int *memClockMHz);
void nvml_gpu_temp_thresholds(int index, int *shutdown, int *slowdown);
void nvml_gpu_power_cap(int index, double *powerCapW);
void nvml_gpu_driver_version(char *buf, size_t buf_size);
void nvml_gpu_perf_state(int index, int *perfState);

#endif // GPU_H
