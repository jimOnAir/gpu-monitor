import type { ISettings } from '@gpu-monitor/shared';

import type { AgentData } from '../polling/AgentData';

export interface INotificationService {
  evaluateAndNotify: (agentData: AgentData, settings: ISettings) => void;
}
