import type { ISettings } from '@gpu-monitor/shared';
import type { Tray } from 'electron';

import type { AgentData } from '../polling/AgentData';

export interface ITrayService {
  createTray: (opts: {
    onShow: () => void,
    onRefresh: () => void,
    onOpenSettings: () => void,
    onExit: () => void,
  }) => void;
  updateTrayFromData: (data: AgentData, settings: ISettings) => void;
  getTray: () => Tray | null;
}
