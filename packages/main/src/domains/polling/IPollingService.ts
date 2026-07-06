import type { ISettings } from '@gpu-monitor/shared';

import type { AgentData, PollingHandlers } from './AgentData';

export interface IPollingService {
  startPolling: (settings: ISettings) => void;
  stopPolling: () => void;
  refreshAllAgents: () => Promise<void>;
  getAgentData: () => AgentData;
  registerHandlers: (handlers: PollingHandlers) => void;
}
