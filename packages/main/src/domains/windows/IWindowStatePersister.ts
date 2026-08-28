import type { IWindowHandle } from './IWindowHandle';

export interface IWindowState {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface IWindowStatePersister {
  load: () => IWindowState;
  save: (window: IWindowHandle) => void;
}
