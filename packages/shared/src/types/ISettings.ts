import type { IAgent } from './IAgent';

export interface ITemperatureThresholds {
  core: { warn: number, critical: number };
  junction: { warn: number, critical: number };
  vram: { warn: number, critical: number };
}

export interface INotificationCooldowns {
  tempCritical: number; // milliseconds
  tempWarn: number;
  tempRecover: number;
  agentOffline: number;
  agentOnline: number;
  allRecovered: number;
}

export interface INotificationsConfig {
  enabled: boolean;
  cooldowns: INotificationCooldowns;
}

export interface ISettings {
  agents: IAgent[];
  refreshInterval: number; // milliseconds
  thresholds: ITemperatureThresholds;
  notifications: INotificationsConfig;
}
