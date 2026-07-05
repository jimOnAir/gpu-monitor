import type { BrowserWindow } from 'electron';

export interface IWindowService {
  createMainWindow: (settings: unknown) => BrowserWindow;
  createPreferencesWindow: (parent: BrowserWindow | null) => void;
  getMainWindow: () => BrowserWindow | null;
  getPreferencesWindow: () => BrowserWindow | null;
  setMainWindow: (win: BrowserWindow | null) => void;
  setPreferencesWindow: (win: BrowserWindow | null) => void;
  setWillQuit: (value: boolean) => void;
  buildTrustedOrigins: (settings: unknown) => Set<string>;
}
