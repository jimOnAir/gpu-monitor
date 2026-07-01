/**
 * Structured in-app logger.
 *
 * Collects log entries in memory (for DebugPanel display) and also
 * writes to console for browser devtools. Supports 4 levels:
 * debug, info, warn, error.
 *
 * Used by AgentService, AgentRepository, and displayed in DebugPanel.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  ts: number;
  level: LogLevel;
  component?: string;
  agent?: string;
  message: string;
  meta?: Record<string, unknown>;
}

const MAX_ENTRIES = 50;
const entries: LogEntry[] = [];

function emit(level: LogLevel, component: string, agent: string | undefined, message: string, meta?: Record<string, unknown>): void {
  const entry: LogEntry = { ts: Date.now(), level, component, agent, message, meta };
  entries.unshift(entry);
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;

  // Also write to console for browser devtools
  switch (level) {
    case 'debug':
      console.debug(`[${component}]${agent ? ` [${agent}]` : ''} ${message}`, meta ?? '');
      break;
    case 'info':
      console.log(`[${component}]${agent ? ` [${agent}]` : ''} ${message}`, meta ?? '');
      break;
    case 'warn':
      console.warn(`[${component}]${agent ? ` [${agent}]` : ''} ${message}`, meta ?? '');
      break;
    case 'error':
      console.error(`[${component}]${agent ? ` [${agent}]` : ''} ${message}`, meta ?? '');
      break;
  }
}

export const logger = {
  debug(component: string, agent: string | undefined, message: string, meta?: Record<string, unknown>) {
    emit('debug', component, agent, message, meta);
  },
  info(component: string, agent: string | undefined, message: string, meta?: Record<string, unknown>) {
    emit('info', component, agent, message, meta);
  },
  warn(component: string, agent: string | undefined, message: string, meta?: Record<string, unknown>) {
    emit('warn', component, agent, message, meta);
  },
  error(component: string, agent: string | undefined, message: string, meta?: Record<string, unknown>) {
    emit('error', component, agent, message, meta);
  },

  getEntries(): LogEntry[] {
    return [...entries];
  },
  clear(): void {
    entries.length = 0;
  },
};
