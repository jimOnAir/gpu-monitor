import { IAgent } from './IAgent';
import { EAgentStatus } from '../enums/EAgentStatus';

export interface ITemperatureThresholds {
  core: { warn: number; critical: number };
  junction: { warn: number; critical: number };
  vram: { warn: number; critical: number };
}

export interface ISettings {
  agents: IAgent[];
  refreshInterval: number; // milliseconds
  thresholds: ITemperatureThresholds;
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
};
