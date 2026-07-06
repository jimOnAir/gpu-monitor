import type { AgentData, FetchResult } from '@gpu-monitor/shared';

export type { AgentData, FetchResult };

/**
 * Callback handlers registered by the composition root.
 * Allows PollingService to push data out without knowing about renderer/notification/tray details.
 */
export interface PollingHandlers {
  pushToRenderer: () => void;
  evaluateAndNotify: (agentData: AgentData, settings: import('@gpu-monitor/shared').ISettings) => void;
  updateTrayFromData: () => void;
}
