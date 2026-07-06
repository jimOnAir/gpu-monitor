import type { ISettings } from '@gpu-monitor/shared';
import type { BrowserWindow, Tray } from 'electron';

import type { AgentData } from '../polling/AgentData';

export interface IWindowService {
  createMainWindow: (settings: ISettings, tray: Tray | null) => void;
  createPreferencesWindow: (parent: BrowserWindow | null) => void;
  getMainWindow: () => BrowserWindow | null;
  getPreferencesWindow: () => BrowserWindow | null;
  setMainWindow: (win: BrowserWindow | null) => void;
  setPreferencesWindow: (win: BrowserWindow | null) => void;
  setWillQuit: (value: boolean) => void;
  buildTrustedOrigins: (settings: ISettings) => Set<string>;
  pushToRenderer: (data: AgentData) => void;
}
