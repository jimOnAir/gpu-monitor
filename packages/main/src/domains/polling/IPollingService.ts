import type { AgentData, Settings } from '../notifications/INotificationService';

export interface IPollingService {
  startPolling: (settings: Settings) => void;
  stopPolling: () => void;
  refreshAllAgents: () => Promise<void>;
  getAgentData: () => AgentData;
}
