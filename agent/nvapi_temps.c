/**
 * Junction (hotspot) and VRAM temperature reads via NVAPI.
 *
 * NVAPI (libnvidia-api.so.1) exposes the driver's thermal telemetry through
 * three entry points — two of them undocumented. Mechanism replicated from
 * LACT (https://github.com/ilya-zlobintsev/LACT, MIT):
 *
 *  - NvAPI_GPU_THERM_CHANNEL_GET_INFO  (0x0bc8163d, v2): channel mask and
 *    primary channel indices (type 1 = hotspot, type 3 = memory)
 *  - NvAPI_GPU_THERM_CHANNEL_GET_STATUS(0x65fe3aad, v2): per-channel raw
 *    temperatures, fixed-point 8.8 (divide by 256)
 *  - NvAPI_GPU_REGISTER_OP             (0x2eb3c140, v1): driver-mediated
 *    BAR0 register read. On Blackwell (RTX 50) the per-channel hotspot
 *    sensor is gone and the aggregated hotspot lives at register 0xad0aa0,
 *    parsed as (raw & 0xFFFF) / 256.
 *
 * The legacy /dev/mem BAR0 offsets in gpu.c (junction 0x0002046C,
 * VRAM 0x0000E2A8) are Turing/Ampere/Ada registers — dead on Blackwell.
 *
 * All NVAPI calls are serialized with a mutex: NVAPI keeps global state and
 * the HTTP server uses one thread per connection.
 */

#include <dlfcn.h>
#include <pthread.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "nvapi_temps.h"
#include "logger.h"

typedef int32_t NvAPI_Status;
typedef void *NvPhysicalGpuHandle;
typedef uint8_t NvU8;
typedef uint16_t NvU16;
typedef int32_t NvS32;
typedef uint32_t NvU32;
typedef uint64_t NvU64;

#define NVAPI_MAX_PHYSICAL_GPUS 64
#define NVAPI_SHORT_STRING_MAX 64

#define NVAPI_OK 0

/* NVAPI versioned-struct encoding: size of struct in low bits, version in high bits */
#define NVAPI_STRUCT_VER(type, ver) ((NvU32)(sizeof(type) | ((ver) << 16)))

/* Undocumented NVAPI entry-point IDs (from LACT, stable across r550–r610 drivers) */
#define QUERY_NVAPI_INITIALIZE 0x0150e828u
#define QUERY_NVAPI_UNLOAD 0xd22bdd7eu
#define QUERY_NVAPI_ENUM_PHYSICAL_GPUS 0xe5ac921fu
#define QUERY_NVAPI_GPU_GET_BUS_ID 0x1be0b8e5u
#define QUERY_NVAPI_GET_ERROR_MESSAGE 0x6c2d048cu
#define QUERY_NVAPI_GPU_THERM_CHANNEL_GET_INFO 0x0bc8163du
#define QUERY_NVAPI_GPU_THERM_CHANNEL_GET_STATUS 0x65fe3aadu
#define QUERY_NVAPI_GPU_REGISTER_OP 0x2eb3c140u

#define THERM_CHANNEL_TYPE_HOTSPOT 1
#define THERM_CHANNEL_TYPE_MEMORY 3

/* Blackwell aggregated hotspot register (BAR0 offset, via driver register op) */
#define REG_OFFSET_BLACKWELL_HOTSPOT_AGGREGATED 0xad0aa0u

#define REG_OP_FLAG_READ 0x1u
#define REG_OP_FLAG_32BIT 0x4u
#define REG_OP_FLAG_TYPE_GLOBAL 0x10u

typedef struct {
    NvU32 class;
    NvU32 channel_type;
    NvU32 rel_loc;
    NvU32 target_gpu;
    NvS32 scaling;
    NvS32 offset_sw;
    NvS32 min_temp;
    NvS32 max_temp;
    NvU8 is_temp_sim_supported;
    NvU8 flags;
    NvS32 offset_hw;
    NvU8 rsvd[28];
    NvU8 data[16];
} NvApiThermChannel;

typedef struct {
    NvU32 version;
    NvS32 mask;
    NvU8 rsvd[32];
    NvApiThermChannel channels[32];
    NvU8 primary_channel_idx[5];
} NvApiThermChannelInfo;

typedef struct {
    NvU32 version;
    NvS32 mask;
    NvU8 rsvd[32];
    NvS32 temps[32];
} NvApiThermals;

typedef struct {
    NvU16 flags;
    NvU16 status;
    NvU32 offset;
    NvU64 write_mask;
    NvU64 value;
} NvGpuRegisterOp;

typedef struct {
    NvU32 version;
    NvU32 op_count;
    NvGpuRegisterOp op[256];
} NvGpuRegisterOpDataV1;

/* Layout drift would silently return wrong temps — pin the byte-exact ABI */
_Static_assert(sizeof(NvApiThermChannel) == 84, "NvApiThermChannel layout drift");
_Static_assert(sizeof(NvApiThermChannelInfo) == 2736, "NvApiThermChannelInfo layout drift");
_Static_assert(sizeof(NvApiThermals) == 168, "NvApiThermals layout drift");
_Static_assert(sizeof(NvGpuRegisterOp) == 24, "NvGpuRegisterOp layout drift");
_Static_assert(sizeof(NvGpuRegisterOpDataV1) == 6152, "NvGpuRegisterOpDataV1 layout drift");

typedef NvAPI_Status (*nvapi_init_fn)(void);
typedef NvAPI_Status (*nvapi_enum_gpus_fn)(NvPhysicalGpuHandle *, NvU32 *);
typedef NvAPI_Status (*nvapi_get_bus_id_fn)(NvPhysicalGpuHandle, NvU32 *);
typedef NvAPI_Status (*nvapi_therm_info_fn)(NvPhysicalGpuHandle, NvApiThermChannelInfo *);
typedef NvAPI_Status (*nvapi_therm_status_fn)(NvPhysicalGpuHandle, NvApiThermals *);
typedef NvAPI_Status (*nvapi_reg_op_fn)(NvPhysicalGpuHandle, NvGpuRegisterOpDataV1 *);

typedef void *(*nvapi_query_interface_fn)(NvU32);
typedef NvAPI_Status (*nvapi_error_message_fn)(NvAPI_Status, char *);

static struct {
    void *lib;
    int supported; /* 0 unknown/init-failed, 1 usable */
    int attempted;
    nvapi_query_interface_fn query_interface;
    nvapi_error_message_fn get_error_message;
    nvapi_init_fn initialize;
    nvapi_enum_gpus_fn enum_physical_gpus;
    nvapi_get_bus_id_fn get_bus_id;
    nvapi_therm_info_fn therm_channel_get_info;
    nvapi_therm_status_fn therm_channel_get_status;
    nvapi_reg_op_fn register_op;
} g_nvapi;

static pthread_mutex_t g_nvapi_mutex = PTHREAD_MUTEX_INITIALIZER;

static void *query_interface(NvU32 id) {
    if (!g_nvapi.query_interface) {
        return NULL;
    }
    return g_nvapi.query_interface(id);
}

static void nvapi_log_status(const char *op, NvAPI_Status status) {
    if (status == NVAPI_OK) {
        return;
    }
    char msg[NVAPI_SHORT_STRING_MAX] = {0};
    if (g_nvapi.get_error_message &&
        g_nvapi.get_error_message(status, msg) == NVAPI_OK && msg[0]) {
        log_debug("NVAPI %s failed: %s (0x%x)", op, msg, status);
    } else {
        log_debug("NVAPI %s failed with status 0x%x", op, status);
    }
}

static void nvapi_init_once(void) {
    if (g_nvapi.attempted) {
        return;
    }
    g_nvapi.attempted = 1;

    g_nvapi.lib = dlopen("libnvidia-api.so.1", RTLD_NOW | RTLD_LOCAL);
    if (!g_nvapi.lib) {
        log_info("NVAPI unavailable (libnvidia-api.so.1 not found) — junction/VRAM fall back to /dev/mem");
        return;
    }

    g_nvapi.query_interface = (nvapi_query_interface_fn)dlsym(g_nvapi.lib, "nvapi_QueryInterface");
    if (!g_nvapi.query_interface) {
        log_warn("NVAPI library has no nvapi_QueryInterface — junction/VRAM fall back to /dev/mem");
        return;
    }
    g_nvapi.get_error_message = (nvapi_error_message_fn)query_interface(QUERY_NVAPI_GET_ERROR_MESSAGE);

    g_nvapi.initialize = (nvapi_init_fn)query_interface(QUERY_NVAPI_INITIALIZE);
    g_nvapi.enum_physical_gpus = (nvapi_enum_gpus_fn)query_interface(QUERY_NVAPI_ENUM_PHYSICAL_GPUS);
    g_nvapi.get_bus_id = (nvapi_get_bus_id_fn)query_interface(QUERY_NVAPI_GPU_GET_BUS_ID);
    g_nvapi.therm_channel_get_info = (nvapi_therm_info_fn)query_interface(QUERY_NVAPI_GPU_THERM_CHANNEL_GET_INFO);
    g_nvapi.therm_channel_get_status = (nvapi_therm_status_fn)query_interface(QUERY_NVAPI_GPU_THERM_CHANNEL_GET_STATUS);
    g_nvapi.register_op = (nvapi_reg_op_fn)query_interface(QUERY_NVAPI_GPU_REGISTER_OP);

    if (!g_nvapi.initialize || !g_nvapi.enum_physical_gpus || !g_nvapi.get_bus_id ||
        !g_nvapi.therm_channel_get_info || !g_nvapi.therm_channel_get_status) {
        log_warn("NVAPI loaded but required entry points missing — junction/VRAM fall back to /dev/mem");
        return;
    }

    NvAPI_Status status = g_nvapi.initialize();
    if (status != NVAPI_OK) {
        nvapi_log_status("Initialize", status);
        log_warn("NVAPI Initialize failed — junction/VRAM fall back to /dev/mem");
        return;
    }

    g_nvapi.supported = 1;
    log_info("NVAPI initialized (junction/VRAM via therm channels%s)",
             g_nvapi.register_op ? " + register op" : "");
}

int nvapi_temps_supported(void) {
    pthread_mutex_lock(&g_nvapi_mutex);
    nvapi_init_once();
    int supported = g_nvapi.supported;
    pthread_mutex_unlock(&g_nvapi_mutex);
    return supported;
}

static NvPhysicalGpuHandle find_handle_by_bus(unsigned int pciBus) {
    NvPhysicalGpuHandle handles[NVAPI_MAX_PHYSICAL_GPUS];
    NvU32 count = 0;
    if (g_nvapi.enum_physical_gpus(handles, &count) != NVAPI_OK) {
        return NULL;
    }
    for (NvU32 i = 0; i < count && i < NVAPI_MAX_PHYSICAL_GPUS; i++) {
        NvU32 busId = 0;
        if (g_nvapi.get_bus_id(handles[i], &busId) == NVAPI_OK && busId == (NvU32)pciBus) {
            return handles[i];
        }
    }
    return NULL;
}

static int therm_channel_value(NvPhysicalGpuHandle handle, const NvApiThermChannelInfo *info,
                               int channel_type, double *outC) {
    if (channel_type < 0 || channel_type > 4) {
        return 0;
    }
    int idx = info->primary_channel_idx[channel_type];
    if (idx >= 32 || (info->mask & (1 << idx)) == 0) {
        return 0;
    }

    NvApiThermals sensors;
    memset(&sensors, 0, sizeof(sensors));
    sensors.version = NVAPI_STRUCT_VER(NvApiThermals, 2);
    sensors.mask = info->mask;
    if (g_nvapi.therm_channel_get_status(handle, &sensors) != NVAPI_OK) {
        return 0;
    }

    int raw = sensors.temps[idx];
    /* 8.8 fixed-point: raw < 256 decodes to < 1°C — sub-1 values serialize as "0.0"
       and are indistinguishable from a dead sensor, so treat them as invalid. */
    if (raw < 256 || raw >= 255 * 256) {
        return 0;
    }
    *outC = raw / 256.0;
    return 1;
}

static int blackwell_hotspot_register(NvPhysicalGpuHandle handle, double *outC) {
    if (!g_nvapi.register_op) {
        return 0;
    }
    NvGpuRegisterOpDataV1 params;
    memset(&params, 0, sizeof(params));
    params.version = NVAPI_STRUCT_VER(NvGpuRegisterOpDataV1, 1);
    params.op_count = 1;
    params.op[0].flags = (NvU16)(REG_OP_FLAG_READ | REG_OP_FLAG_32BIT | REG_OP_FLAG_TYPE_GLOBAL);
    params.op[0].offset = REG_OFFSET_BLACKWELL_HOTSPOT_AGGREGATED;

    NvAPI_Status reg_status = g_nvapi.register_op(handle, &params);
    if (reg_status != NVAPI_OK) {
        nvapi_log_status("GPU_REGISTER_OP(hotspot)", reg_status);
        return 0;
    }
    if (params.op[0].status != 0) {
        log_debug("NVAPI register op status 0x%x for hotspot read", params.op[0].status);
        return 0;
    }
    NvU64 raw = params.op[0].value & 0xFFFFu;
    NvU64 temp = raw / 256u;
    if (temp == 0 || temp >= 255) {
        log_debug("NVAPI hotspot raw=0x%llx parsed %llu°C — out of range",
                  (unsigned long long)(params.op[0].value), (unsigned long long)temp);
        return 0;
    }
    *outC = (double)temp;
    return 1;
}

int nvapi_read_temps(unsigned int pciBus, int blackwell, NvapiTemps *out) {
    out->junction = 0;
    out->junctionValid = 0;
    out->vram = 0;
    out->vramValid = 0;

    pthread_mutex_lock(&g_nvapi_mutex);
    nvapi_init_once();
    if (!g_nvapi.supported) {
        pthread_mutex_unlock(&g_nvapi_mutex);
        return -1;
    }

    NvPhysicalGpuHandle handle = find_handle_by_bus(pciBus);
    if (!handle) {
        log_debug("NVAPI: no physical GPU found for PCI bus %02X", pciBus);
        pthread_mutex_unlock(&g_nvapi_mutex);
        return -1;
    }

    NvApiThermChannelInfo info;
    memset(&info, 0, sizeof(info));
    info.version = NVAPI_STRUCT_VER(NvApiThermChannelInfo, 2);
    NvAPI_Status info_status = g_nvapi.therm_channel_get_info(handle, &info);
    int have_info = (info_status == NVAPI_OK);
    nvapi_log_status("THERM_CHANNEL_GET_INFO", info_status);
    if (!have_info) {
        info.mask = 0;
        memset(info.primary_channel_idx, 0xff, sizeof(info.primary_channel_idx));
    }
    log_debug("NVAPI read: bus=%02X blackwell=%d channels mask=0x%08X hotspotCh=%d vramCh=%d",
              pciBus, blackwell, (unsigned int)info.mask,
              info.primary_channel_idx[THERM_CHANNEL_TYPE_HOTSPOT],
              info.primary_channel_idx[THERM_CHANNEL_TYPE_MEMORY]);

    if (blackwell) {
        out->junctionValid = blackwell_hotspot_register(handle, &out->junction);
    }
    if (!out->junctionValid && have_info) {
        out->junctionValid = therm_channel_value(handle, &info, THERM_CHANNEL_TYPE_HOTSPOT, &out->junction);
    }
    if (have_info) {
        out->vramValid = therm_channel_value(handle, &info, THERM_CHANNEL_TYPE_MEMORY, &out->vram);
    }

    pthread_mutex_unlock(&g_nvapi_mutex);
    return 0;
}
