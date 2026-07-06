import type { BrowserWindow } from 'electron';

export interface IWindowFactory {
  create: (opts: {
    x?: number,
    y?: number,
    width?: number,
    height?: number,
    minWidth?: number,
    minHeight?: number,
    parent?: BrowserWindow,
    backgroundColor?: string,
    icon?: Electron.NativeImage,
    hasShadow?: boolean,
    roundedCorners?: boolean,
    titleBarStyle?: 'hidden' | 'default',
    show?: boolean,
  }) => BrowserWindow;
}
