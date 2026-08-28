import type { ISettings } from '@gpu-monitor/shared';

import type { AgentData } from '../polling/AgentData';

import type { IWindowHandle } from './IWindowHandle';

export interface IWindowService {
  createMainWindow: (settings: ISettings) => void;
  showMainWindow: () => void;
  hideMainWindow: () => void;
  getMainWindow: () => IWindowHandle | null;
  ensureMainWindow: (settings: ISettings) => void;
  togglePreferencesWindow: () => void;
  setWillQuit: (value: boolean) => void;
  pushToRenderer: (data: AgentData) => void;
}
