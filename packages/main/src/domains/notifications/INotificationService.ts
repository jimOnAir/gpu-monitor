import type { EAgentStatus, IGpu } from '@gpu-monitor/shared';

export interface Settings {
  agents: Array<{
    id: string,
    name: string,
    url: string,
    status?: EAgentStatus,
    lastError?: string,
    lastUpdate?: number,
  }>;
  refreshInterval: number;
  thresholds: {
    core: { warn: number, critical: number },
    junction: { warn: number, critical: number },
    vram: { warn: number, critical: number },
  };
  notifications: {
    enabled: boolean,
    cooldowns: {
      tempCritical: number,
      tempWarn: number,
      tempRecover: number,
      agentOffline: number,
      agentOnline: number,
      allRecovered: number,
    },
  };
}

export interface AgentData {
  agents: Array<{
    id: string,
    name: string,
    url: string,
    status?: EAgentStatus,
    lastError?: string,
    lastUpdate?: number,
  }>;
  gpus: Map<string, IGpu[]>;
  lastUpdate: Map<string, number>;
  lastFetchTimestamp: Map<string, number>;
  statusChangedAt: Map<string, number>;
  fetchResult: Map<string, string>;
}

export interface INotificationService {
  evaluateAndNotify: (agentData: AgentData, settings: Settings) => void;
}
