/**
 * logger.c — structured logging for gputempd
 *
 * stdout for all levels (DEBUG..CRITICAL).
 * syslog (LOG_USER) for WARN+ (captured by journald when run as service).
 *
 * Design:
 * - DEBUG/INFO: stdout only — avoids flooding syslog on frequent polls
 * - WARN/ERROR/CRITICAL: stdout + syslog — daemon-aware error capture
 * - Timestamps: strftime() in format string (consistent across all output)
 * - syslog adds its own timestamp + PID, so we rely on that for daemon logs
 */

#define _GNU_SOURCE

#include "logger.h"

#include <errno.h>
#include <fcntl.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <syslog.h>
#include <time.h>
#include <unistd.h>

/* Minimum log level — messages below this are silently dropped */
static LogLevel min_level = LOG_LEVEL_INFO;

/* Level name for stdout output (5-char padded) */
static const char *level_names[] = {
    [LOG_LEVEL_DEBUG]    = "DEBUG",
    [LOG_LEVEL_INFO]     = "INFO ",
    [LOG_LEVEL_NOTICE]   = "NOTE ",
    [LOG_LEVEL_WARNING]  = "WARN ",
    [LOG_LEVEL_ERROR]    = "ERROR",
    [LOG_LEVEL_CRITICAL] = "CRIT ",
};

static LogLevel parse_level(const char *str) {
    if (!str || !*str) return LOG_LEVEL_INFO;

    if (strcasecmp(str, "debug") == 0)    return LOG_LEVEL_DEBUG;
    if (strcasecmp(str, "info") == 0)     return LOG_LEVEL_INFO;
    if (strcasecmp(str, "notice") == 0)   return LOG_LEVEL_NOTICE;
    if (strcasecmp(str, "warn") == 0 ||
        strcasecmp(str, "warning") == 0)  return LOG_LEVEL_WARNING;
    if (strcasecmp(str, "error") == 0)    return LOG_LEVEL_ERROR;
    if (strcasecmp(str, "critical") == 0) return LOG_LEVEL_CRITICAL;

    fprintf(stderr, "logger: unknown level '%s', using INFO\n", str);
    return LOG_LEVEL_INFO;
}

void log_init(const char *env_level) {
    min_level = parse_level(env_level);

    /* Open syslog: LOG_NDELAY opens immediately, LOG_PID includes PID */
    openlog("gputempd", LOG_NDELAY | LOG_PID, LOG_USER);
}

void log_msg(LogLevel level, const char *fmt, ...) {
    if (level < min_level) return;

    /* Format message into a buffer */
    char buf[1024];
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(buf, sizeof(buf), fmt, ap);
    va_end(ap);

    /* Always print to stdout: [TIMESTAMP] [LEVEL] message */
    time_t now = time(NULL);
    struct tm tm_buf;
    char timebuf[32];
    localtime_r(&now, &tm_buf);
    strftime(timebuf, sizeof(timebuf), "%Y-%m-%d %H:%M:%S", &tm_buf);

    fprintf(stdout, "[%s] [%s] %s\n", timebuf, level_names[level], buf);
    fflush(stdout);

    /* WARN and above also go to syslog (journald captures these) */
    if (level >= LOG_LEVEL_WARNING) {
        int syslog_priority;
        switch (level) {
            case LOG_LEVEL_WARNING:  syslog_priority = LOG_WARNING;  break;
            case LOG_LEVEL_ERROR:    syslog_priority = LOG_ERR;      break;
            case LOG_LEVEL_CRITICAL: syslog_priority = LOG_CRIT;     break;
            default: syslog_priority = LOG_INFO; break;
        }
        syslog(syslog_priority, "%s", buf);
    }
}
