import type { ISettings } from '@gpu-monitor/shared';

import type { AgentData } from '../polling/AgentData';

import type { ITrayHandle } from './ITrayHandle';

export interface ITrayService {
  createTray: (opts: {
    onShow: () => void,
    onRefresh: () => void,
    onOpenSettings: () => void,
    onExit: () => void,
  }) => void;
  updateTrayFromData: (data: AgentData, settings: ISettings) => void;
  getTray: () => ITrayHandle | null;
}
