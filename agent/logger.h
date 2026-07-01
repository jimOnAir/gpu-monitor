/**
 * logger.h — structured logging for gputempd
 *
 * Outputs to stdout. For WARN and above, also sends to syslog
 * (via LOG_USER) for daemon integration with journald/logrotate.
 *
 * Log level controlled by GPUTEMP_LOG_LEVEL env var:
 *   DEBUG, INFO (default), WARN, ERROR, CRITICAL
 *
 * Usage:
 *   log_init(getenv("GPUTEMP_LOG_LEVEL"));
 *   log_info("Detected %d GPU(s)", count);
 *   log_warn("GPU %d: read failed: %s", idx, strerror(errno));
 *   log_error("NVML init failed");
 */

#ifndef LOGGER_H
#define LOGGER_H

#include <stdarg.h>

/* Log levels — ordered so numeric comparison works for filtering */
typedef enum {
    LOG_LEVEL_DEBUG    = 0,
    LOG_LEVEL_INFO     = 1,
    LOG_LEVEL_NOTICE   = 2,
    LOG_LEVEL_WARNING  = 3,
    LOG_LEVEL_ERROR    = 4,
    LOG_LEVEL_CRITICAL = 5,
} LogLevel;

/**
 * Initialize the logger.
 * Reads GPUTEMP_LOG_LEVEL if provided, defaults to INFO.
 * Opens syslog connection with LOG_NDELAY | LOG_PID.
 */
void log_init(const char *env_level);

/**
 * Format and emit a log message.
 * Always prints to stdout. WARN+ also goes to syslog.
 */
void log_msg(LogLevel level, const char *fmt, ...)
    __attribute__((format(printf, 2, 3)));

/* Convenience macros */
#define log_debug(...)  log_msg(LOG_LEVEL_DEBUG,   __VA_ARGS__)
#define log_info(...)   log_msg(LOG_LEVEL_INFO,    __VA_ARGS__)
#define log_notice(...) log_msg(LOG_LEVEL_NOTICE,  __VA_ARGS__)
#define log_warn(...)   log_msg(LOG_LEVEL_WARNING, __VA_ARGS__)
#define log_error(...)  log_msg(LOG_LEVEL_ERROR,   __VA_ARGS__)
#define log_critical(...) log_msg(LOG_LEVEL_CRITICAL, __VA_ARGS__)

#endif /* LOGGER_H */
