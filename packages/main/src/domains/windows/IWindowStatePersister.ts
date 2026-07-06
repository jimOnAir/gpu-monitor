import type { BrowserWindow } from 'electron';

export interface IWindowState {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface IWindowStatePersister {
  load: () => IWindowState;
  save: (window: BrowserWindow) => void;
}
