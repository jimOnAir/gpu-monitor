import type { AgentData, ISettings } from '@gpu-monitor/shared';

export type { AgentData };

/**
 * Callback handlers registered by the composition root.
 * Allows PollingService to push data out without knowing about renderer/notification/tray details.
 */
export interface PollingHandlers {
  pushToRenderer: () => void;
  evaluateAndNotify: (agentData: AgentData, settings: ISettings) => void;
  updateTrayFromData: () => void;
}
