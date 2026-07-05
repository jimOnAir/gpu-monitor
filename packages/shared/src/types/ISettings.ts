import { EAgentStatus } from '../enums/EAgentStatus';

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

/** Default settings applied when no settings file exists. */
export const DEFAULT_SETTINGS: ISettings = {
  agents: [
    {
      id: 'localhost',
      name: 'localhost',
      url: 'http://localhost:9091',
      status: EAgentStatus.Offline,
    },
  ],
  refreshInterval: 5000,
  thresholds: {
    core: { warn: 70, critical: 85 },
    junction: { warn: 80, critical: 95 },
    vram: { warn: 80, critical: 95 },
  },
  notifications: {
    enabled: true,
    cooldowns: {
      tempCritical: 60000,
      tempWarn: 120000,
      tempRecover: 60000,
      agentOffline: 30000,
      agentOnline: 30000,
      allRecovered: 300000,
    },
  },
};
