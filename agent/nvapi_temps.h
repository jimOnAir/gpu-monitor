/**
 * Junction (hotspot) and VRAM temperature reads via NVIDIA's NVAPI
 * (libnvidia-api.so.1). Primary sensor source for all architectures;
 * the /dev/mem BAR0 path in gpu.c remains the fallback.
 */

#ifndef NVAPI_TEMPS_H
#define NVAPI_TEMPS_H

typedef struct {
    double junction;      /* valid only when junctionValid */
    int junctionValid;
    double vram;          /* valid only when vramValid */
    int vramValid;
} NvapiTemps;

/* 1 if libnvidia-api.so.1 loaded and NVAPI initialized, 0 otherwise. */
int nvapi_temps_supported(void);

/*
 * Read junction + VRAM temps for the GPU on the given PCI bus number.
 * blackwell selects the aggregated hotspot register (0xad0aa0) instead of
 * the therm-channel hotspot channel.
 * Returns 0 when the GPU was found via NVAPI (check the Valid flags),
 * -1 when NVAPI is unusable for this GPU (caller falls back to /dev/mem).
 */
int nvapi_read_temps(unsigned int pciBus, int blackwell, NvapiTemps *out);

#endif /* NVAPI_TEMPS_H */
