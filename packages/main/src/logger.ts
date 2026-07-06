import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  name: 'gpu-monitor-main',
});

export type Logger = typeof logger;
export default logger;
