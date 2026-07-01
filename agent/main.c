/**
 * gputempd - GPU temperature daemon
 * 
 * Reads Core, Junction, and VRAM temperatures via NVML + /dev/mem
 * Serves data over HTTP on configurable port
 * 
 * Build:
 *   make
 * 
 * Run:
 *   sudo ./gputempd [port]
 * 
 * Env vars:
 *   GPUTEMP_PORT         - HTTP port (default: 8080)
 *   GPUTEMP_LOG_LEVEL    - Log level: DEBUG, INFO (default), WARN, ERROR
 *   GPUTEMP_CORE_WARN    - Core temp warning threshold (default: 70)
 *   GPUTEMP_CORE_DANGER  - Core temp danger threshold (default: 85)
 *   GPUTEMP_JUNCTION_WARN    - Junction temp warning threshold (default: 80)
 *   GPUTEMP_JUNCTION_DANGER  - Junction temp danger threshold (default: 95)
 *   GPUTEMP_VRAM_WARN    - VRAM temp warning threshold (default: 80)
 *   GPUTEMP_VRAM_DANGER  - VRAM temp danger threshold (default: 95)
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <signal.h>
#include <unistd.h>
#include <time.h>
#include <pthread.h>
#include <microhttpd.h>

#include "gpu.h"
#include "logger.h"

#define DEFAULT_PORT 8080
#define BUFFER_SIZE 8192

static struct GpuData gpus[16];
static unsigned int gpu_count = 0;
static volatile int running = 1;

void signal_handler(int sig __attribute__((unused))) {
    running = 0;
}

const char* determine_status(double temp, double warn, double danger) {
    if (temp >= danger) return "danger";
    if (temp >= warn) return "warning";
    return "normal";
}

void fill_gpu_status(struct GpuData *gpu, int index) {
    // NVML provides core temp, utilization, memory, power
    if (nvml_gpu_exists(index)) {
        gpu->index = index;
        nvml_gpu_info(index, gpu->name, &gpu->coreTemp, &gpu->utilization, 
                      &gpu->memoryUsed, &gpu->memoryTotal, &gpu->powerUsage);
    } else {
        gpu->index = index;
        strcpy(gpu->name, "Unknown GPU");
        gpu->coreTemp = 0;
        gpu->utilization = 0;
        gpu->memoryUsed = 0;
        gpu->memoryTotal = 0;
        gpu->powerUsage = 0;
    }
    
    // GPU UUID
    if (nvml_gpu_uuid(index, gpu->uuid, sizeof(gpu->uuid)) != 0) {
        strncpy(gpu->uuid, "Unknown", sizeof(gpu->uuid) - 1);
        gpu->uuid[sizeof(gpu->uuid) - 1] = '\0';
    }
    
    // Junction/VRAM from /dev/mem (may fail if mmap not available)
    nvml_read_junction_vram(index, &gpu->junctionTemp, &gpu->vramTemp);
    
    /* Extended metrics */
    if (nvml_gpu_exists(index)) {
        nvml_gpu_fan_speed(index, &gpu->fanSpeed);
        nvml_gpu_clocks(index, &gpu->gpuClockMHz, &gpu->memClockMHz);
        nvml_gpu_temp_thresholds(index, &gpu->tempShutdown, &gpu->tempSlowdown);
        nvml_gpu_power_cap(index, &gpu->powerCapW);
        nvml_gpu_perf_state(index, &gpu->perfState);
    }
    nvml_gpu_driver_version(gpu->driverVersion, sizeof(gpu->driverVersion));
    
    // Determine status
    double core_warn = atof(getenv("GPUTEMP_CORE_WARN") ? getenv("GPUTEMP_CORE_WARN") : "70");
    double core_danger = atof(getenv("GPUTEMP_CORE_DANGER") ? getenv("GPUTEMP_CORE_DANGER") : "85");
    gpu->coreStatus = determine_status(gpu->coreTemp, core_warn, core_danger);
    
    double junction_warn = atof(getenv("GPUTEMP_JUNCTION_WARN") ? getenv("GPUTEMP_JUNCTION_WARN") : "80");
    double junction_danger = atof(getenv("GPUTEMP_JUNCTION_DANGER") ? getenv("GPUTEMP_JUNCTION_DANGER") : "95");
    gpu->junctionStatus = determine_status(gpu->junctionTemp, junction_warn, junction_danger);
    
    double vram_warn = atof(getenv("GPUTEMP_VRAM_WARN") ? getenv("GPUTEMP_VRAM_WARN") : "80");
    double vram_danger = atof(getenv("GPUTEMP_VRAM_DANGER") ? getenv("GPUTEMP_VRAM_DANGER") : "95");
    gpu->vramStatus = determine_status(gpu->vramTemp, vram_warn, vram_danger);
}

char* generate_json_response(void) {
    static char response[BUFFER_SIZE];
    int offset = 0;
    time_t now = time(NULL);
    
    offset += sprintf(response + offset, "{\"timestamp\":%ld,\"gpus\":[", now);
    
    for (int i = 0; i < gpu_count; i++) {
        struct GpuData *gpu = &gpus[i];
        
        if (i > 0) offset += sprintf(response + offset, ",");
        
        offset += sprintf(response + offset,
            "{\"uuid\":\"%s\",\"index\":%d,\"name\":\"%s\","
            "\"coreTemp\":%.1f,\"junctionTemp\":%.1f,\"vramTemp\":%.1f,"
            "\"gpuUtilization\":%.1f,\"memoryUsed\":%lu,\"memoryTotal\":%lu,\"powerUsage\":%.1f,"
            "\"coreStatus\":\"%s\",\"junctionStatus\":\"%s\",\"vramStatus\":\"%s\","
            "\"fanSpeed\":%d,\"gpuClockMHz\":%d,\"memClockMHz\":%d,"
            "\"tempShutdown\":%d,\"tempSlowdown\":%d,\"powerCapW\":%.1f,"
            "\"driverVersion\":\"%s\",\"perfState\":%d}",
            gpu->uuid,
            gpu->index,
            gpu->name,
            gpu->coreTemp,
            gpu->junctionTemp,
            gpu->vramTemp,
            gpu->utilization,
            gpu->memoryUsed,
            gpu->memoryTotal,
            gpu->powerUsage,
            gpu->coreStatus,
            gpu->junctionStatus,
            gpu->vramStatus,
            gpu->fanSpeed,
            gpu->gpuClockMHz,
            gpu->memClockMHz,
            gpu->tempShutdown,
            gpu->tempSlowdown,
            gpu->powerCapW,
            gpu->driverVersion,
            gpu->perfState
        );
    }
    
    offset += sprintf(response + offset, "]}");
    return response;
}

struct MHD_Response* create_response(const char *body, size_t len) {
    struct MHD_Response *response = MHD_create_response_from_buffer(
        len, (void*)body, MHD_RESPMEM_MUST_COPY);
    MHD_add_response_header(response, "Content-Type", "application/json");
    MHD_add_response_header(response, "Access-Control-Allow-Origin", "*");
    MHD_add_response_header(response, "Access-Control-Allow-Methods", "GET, OPTIONS");
    MHD_add_response_header(response, "Access-Control-Allow-Headers", "Content-Type");
    return response;
}

enum MHD_Result handle_request(void *cls __attribute__((unused)), struct MHD_Connection *connection,
                               const char *url, const char *method __attribute__((unused)),
                               const char *version __attribute__((unused)), const char *upload_data __attribute__((unused)),
                               size_t *upload_data_size __attribute__((unused)), void **con_cls __attribute__((unused))) {
    static int doned;
    
    if (doned) {
        doned = 0;
        return MHD_YES;
    }
    doned = 1;
    
    if (strcmp(url, "/gpu") == 0) {
        // Refresh GPU data
        log_debug("HTTP /gpu: refreshing %d GPUs", gpu_count);
        for (int i = 0; i < gpu_count; i++) {
            fill_gpu_status(&gpus[i], i);
        }
        
        char *json = generate_json_response();
        struct MHD_Response *response = create_response(json, strlen(json));
        enum MHD_Result ret = MHD_queue_response(connection, MHD_HTTP_OK, response);
        MHD_destroy_response(response);
        return ret;
    }
    
    if (strcmp(url, "/health") == 0) {
        const char *health = "{\"status\":\"ok\"}";
        struct MHD_Response *response = create_response(health, strlen(health));
        enum MHD_Result ret = MHD_queue_response(connection, MHD_HTTP_OK, response);
        MHD_destroy_response(response);
        return ret;
    }
    
    // 404
    const char *not_found = "{\"error\":\"Not found\"}";
    struct MHD_Response *response = create_response(not_found, strlen(not_found));
    enum MHD_Result ret = MHD_queue_response(connection, MHD_HTTP_NOT_FOUND, response);
    MHD_destroy_response(response);
    return ret;
}

int main(int argc, char *argv[]) {
    signal(SIGINT, signal_handler);
    signal(SIGTERM, signal_handler);

    // Initialize logger
    log_init(getenv("GPUTEMP_LOG_LEVEL"));
    log_info("gputempd starting (pid=%d)", getpid());

    // Initialize NVML
    if (nvml_init() != 0) {
        log_error("Failed to initialize NVML");
        return 1;
    }

    // Detect GPUs
    gpu_count = nvml_get_gpu_count();
    if (gpu_count == 0) {
        log_error("No NVIDIA GPUs found");
        return 1;
    }

    log_info("Detected %d GPU(s)", gpu_count);
    for (int i = 0; i < gpu_count; i++) {
        char name[256];
        nvml_gpu_info(i, name, NULL, NULL, NULL, NULL, NULL);
        log_info("  GPU %d: %s", i, name);
    }

    // Initialize first read
    for (int i = 0; i < gpu_count; i++) {
        fill_gpu_status(&gpus[i], i);
    }

    // Start HTTP server
    int port = DEFAULT_PORT;
    if (argc > 1) {
        port = atoi(argv[1]);
    } else if (getenv("GPUTEMP_PORT")) {
        port = atoi(getenv("GPUTEMP_PORT"));
    }

    log_info("Starting HTTP server on port %d", port);

    struct MHD_Daemon *daemon = MHD_start_daemon(
        MHD_USE_THREAD_PER_CONNECTION | MHD_USE_INTERNAL_POLLING_THREAD,
        port, NULL, NULL, &handle_request, NULL, MHD_OPTION_END
    );

    if (daemon == NULL) {
        log_error("Failed to start HTTP server");
        nvml_cleanup();
        return 1;
    }

    // Run until signal
    while (running) {
        usleep(100000); // 100ms
    }

    log_info("Shutting down");
    MHD_stop_daemon(daemon);
    nvml_cleanup();

    return 0;
}
