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
#include "gpu_identity.h"
#include "logger.h"

#define DEFAULT_PORT 8080
#define BUFFER_SIZE 8192

static struct GpuData *gpus = NULL;
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

/**
 * Write a JSON-escaped copy of a string to the output buffer.
 * Escapes: \, ", and control characters (using \uXXXX notation).
 * Returns the number of bytes written (excluding null terminator).
 */
int json_escape_string(const char *src, char *dst, size_t dst_size) {
    size_t i = 0;
    size_t j = 0;
    
    while (src[i] && j < dst_size - 1) {
        char c = src[i];
        
        if (c == '\\' || c == '"') {
            if (j + 2 >= dst_size) break;
            dst[j++] = '\\';
            dst[j++] = c;
        } else if (c == '\n') {
            if (j + 2 >= dst_size) break;
            dst[j++] = '\\';
            dst[j++] = 'n';
        } else if (c == '\r') {
            if (j + 2 >= dst_size) break;
            dst[j++] = '\\';
            dst[j++] = 'r';
        } else if (c == '\t') {
            if (j + 2 >= dst_size) break;
            dst[j++] = '\\';
            dst[j++] = 't';
        } else if ((unsigned char)c < 0x20) {
            // Control characters: \uXXXX
            if (j + 6 >= dst_size) break;
            snprintf(dst + j, 7, "\\u%04x", (unsigned char)c);
            j += 6;
        } else {
            if (j + 1 >= dst_size) break;
            dst[j++] = c;
        }
        i++;
    }
    dst[j] = '\0';
    return (int)j;
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
    /* Allocate enough space for max GPUs: each GPU ~450 chars */
    size_t buf_size = (size_t)BUFFER_SIZE * (1 + (gpu_count + 7) / 8);
    char *response = (char *)malloc(buf_size);
    if (!response) {
        log_error("Failed to allocate JSON buffer (need %zu bytes)", buf_size);
        return NULL;
    }

    time_t now = time(NULL);
    int offset = snprintf(response, buf_size, "{\"timestamp\":%ld,\"gpus\":[", now);

    for (int i = 0; i < gpu_count; i++) {
        struct GpuData *gpu = &gpus[i];
        int remaining = (int)(buf_size - (size_t)offset);

        if (i > 0) {
            offset += snprintf(response + offset, (size_t)remaining, ",");
            remaining = (int)(buf_size - (size_t)offset);
            if (remaining <= 0) {
                log_error("JSON buffer overflow at GPU %d (offset=%d, buf=%zu)", i, offset, buf_size);
                free(response);
                return NULL;
            }
        }

        // Escape all string fields for safe JSON embedding
        char escaped_uuid[128], escaped_name[256], escaped_core_status[32];
        char escaped_junction_status[32], escaped_vram_status[32];
        char escaped_driver_version[128], escaped_vendor[128];
        char escaped_model[128], escaped_part_number[128];

        json_escape_string(gpu->uuid, escaped_uuid, sizeof(escaped_uuid));
        json_escape_string(gpu->name, escaped_name, sizeof(escaped_name));
        json_escape_string(gpu->coreStatus, escaped_core_status, sizeof(escaped_core_status));
        json_escape_string(gpu->junctionStatus, escaped_junction_status, sizeof(escaped_junction_status));
        json_escape_string(gpu->vramStatus, escaped_vram_status, sizeof(escaped_vram_status));
        json_escape_string(gpu->driverVersion, escaped_driver_version, sizeof(escaped_driver_version));
        json_escape_string(gpu->vendor, escaped_vendor, sizeof(escaped_vendor));
        json_escape_string(gpu->model, escaped_model, sizeof(escaped_model));
        json_escape_string(gpu->partNumber, escaped_part_number, sizeof(escaped_part_number));

        offset += snprintf(response + offset, (size_t)remaining,
            "{\"uuid\":\"%s\",\"index\":%d,\"name\":\"%s\","
            "\"coreTemp\":%.1f,\"junctionTemp\":%.1f,\"vramTemp\":%.1f,"
            "\"gpuUtilization\":%.1f,\"memoryUsed\":%lu,\"memoryTotal\":%lu,\"powerUsage\":%.1f,"
            "\"coreStatus\":\"%s\",\"junctionStatus\":\"%s\",\"vramStatus\":\"%s\","
            "\"fanSpeed\":%d,\"gpuClockMHz\":%d,\"memClockMHz\":%d,"
            "\"tempShutdown\":%d,\"tempSlowdown\":%d,\"powerCapW\":%.1f,"
            "\"driverVersion\":\"%s\",\"perfState\":%d,"
            "\"vendor\":\"%s\",\"model\":\"%s\",\"partNumber\":\"%s\"}",
            escaped_uuid,
            gpu->index,
            escaped_name,
            gpu->coreTemp,
            gpu->junctionTemp,
            gpu->vramTemp,
            gpu->utilization,
            gpu->memoryUsed,
            gpu->memoryTotal,
            gpu->powerUsage,
            escaped_core_status,
            escaped_junction_status,
            escaped_vram_status,
            gpu->fanSpeed,
            gpu->gpuClockMHz,
            gpu->memClockMHz,
            gpu->tempShutdown,
            gpu->tempSlowdown,
            gpu->powerCapW,
            escaped_driver_version,
            gpu->perfState,
            escaped_vendor,
            escaped_model,
            escaped_part_number
        );

        if (offset < 0 || (size_t)offset >= buf_size) {
            log_error("JSON buffer overflow at GPU %d", i);
            free(response);
            return NULL;
        }
    }

    snprintf(response + offset, (size_t)(buf_size - (size_t)offset), "]}");
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
        if (!json) {
            const char *err_body = "{\"error\":\"Internal error: buffer overflow\"}";
            struct MHD_Response *resp = create_response(err_body, strlen(err_body));
            enum MHD_Result ret = MHD_queue_response(connection, MHD_HTTP_INTERNAL_SERVER_ERROR, resp);
            MHD_destroy_response(resp);
            return ret;
        }
        struct MHD_Response *response = create_response(json, strlen(json));
        free(json); /* allocated by generate_json_response */
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

    // Allocate GPU data array dynamically
    gpus = (struct GpuData *)malloc(gpu_count * sizeof(struct GpuData));
    if (!gpus) {
        log_error("Failed to allocate %u GPU data structures", gpu_count);
        nvml_cleanup();
        return 1;
    }
    memset(gpus, 0, gpu_count * sizeof(struct GpuData));

    // Discover board identities (one-time, cached for lifetime)
    log_info("Discovering GPU board identities...");
    for (int i = 0; i < gpu_count; i++) {
        struct GpuIdentity id;
        discover_gpu_identity(i, &id);
        log_info("  GPU %d: %s %s (PN: %s)", i,
                 id.vendor[0] ? id.vendor : "Unknown",
                 id.model[0] ? id.model : "Unknown",
                 id.partNumber[0] ? id.partNumber : "N/A");
        strncpy(gpus[i].vendor, id.vendor, sizeof(gpus[i].vendor) - 1);
        strncpy(gpus[i].model, id.model, sizeof(gpus[i].model) - 1);
        strncpy(gpus[i].partNumber, id.partNumber, sizeof(gpus[i].partNumber) - 1);
    }

    // Initialize first read
    for (int i = 0; i < gpu_count; i++) {
        fill_gpu_status(&gpus[i], i);
    }

    // Start HTTP server
    int port = DEFAULT_PORT;
    if (argc > 1) {
        if (strcmp(argv[1], "--help") == 0 || strcmp(argv[1], "-h") == 0) {
            printf("Usage: gputempd [port]\n"
                   "\n"
                   "GPU temperature daemon — reads Core/Junction/VRAM temps via NVML + /dev/mem.\n"
                   "\n"
                   "Options:\n"
                   "  port      HTTP port (default: 8080, or GPUTEMP_PORT env var)\n"
                   "  --help    Show this help message\n"
                   "\n"
                   "Environment:\n"
                   "  GPUTEMP_PORT         - HTTP port\n"
                   "  GPUTEMP_LOG_LEVEL    - Log level: DEBUG, INFO, WARN, ERROR\n"
                   "  GPUTEMP_CORE_WARN    - Core temp warning threshold (default: 70)\n"
                   "  GPUTEMP_CORE_DANGER  - Core temp danger threshold (default: 85)\n"
                   "  GPUTEMP_JUNCTION_WARN  - Junction temp warning threshold (default: 80)\n"
                   "  GPUTEMP_JUNCTION_DANGER  - Junction temp danger threshold (default: 95)\n"
                   "  GPUTEMP_VRAM_WARN    - VRAM temp warning threshold (default: 80)\n"
                   "  GPUTEMP_VRAM_DANGER  - VRAM temp danger threshold (default: 95)\n"
                   "\n"
                   "API:\n"
                   "  GET /gpu     - JSON {timestamp, gpus: [...]}\n"
                   "  GET /health  - {\"status\":\"ok\"}\n"
                   "\n"
                   "Note: Junction/VRAM temps require `iomem=relaxed` kernel parameter.\n");
            nvml_cleanup();
            return 0;
        }
        // Validate port: must be all digits
        char *endptr;
        long port_val = strtol(argv[1], &endptr, 10);
        if (*endptr != '\0' || port_val < 1 || port_val > 65535) {
            fprintf(stderr, "Error: invalid port '%s'. Must be 1-65535.\n", argv[1]);
            nvml_cleanup();
            return 1;
        }
        port = (int)port_val;
    } else if (getenv("GPUTEMP_PORT")) {
        char *env_port = getenv("GPUTEMP_PORT");
        char *ep;
        long port_val = strtol(env_port, &ep, 10);
        if (*ep != '\0' || port_val < 1 || port_val > 65535) {
            fprintf(stderr, "Error: invalid GPUTEMP_PORT '%s'. Must be 1-65535.\n", env_port);
            nvml_cleanup();
            return 1;
        }
        port = (int)port_val;
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
    free(gpus);
    gpus = NULL;
    MHD_stop_daemon(daemon);
    nvml_cleanup();

    return 0;
}
