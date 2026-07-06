import type { EAgentStatus, IAgent, IGpu, ISettings } from '@gpu-monitor/shared';

export type FetchResult = 'pending' | 'ok' | 'fetch-failed' | 'health-failed' | 'error';

export interface AgentData {
  agents: IAgent[];
  gpus: Map<string, IGpu[]>;
  lastUpdate: Map<string, number>;
  lastFetchTimestamp: Map<string, number>;
  statusChangedAt: Map<string, number>;
  fetchResult: Map<string, FetchResult>;
  /** Previous agent status before this poll cycle — used for transition detection. */
  prevAgentStatus: Map<string, EAgentStatus>;
}

export interface PollingHandlers {
  pushToRenderer: () => void;
  evaluateAndNotify: (agentData: AgentData, settings: ISettings) => void;
  updateTrayFromData: () => void;
}
