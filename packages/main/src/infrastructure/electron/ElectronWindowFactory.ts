import type { BrowserWindow, NativeImage } from 'electron';
import { nativeTheme } from 'electron';
import { BrowserWindow as ElectronBrowserWindow } from 'electron';
import * as path from 'path';

import type { IWindowFactory } from '../../domains/windows/IWindowFactory';

export interface IThemeColors {
  dark: string;
  light: string;
}

export class ElectronWindowFactory implements IWindowFactory {
  constructor(
    private readonly themeColors: IThemeColors = { dark: '#1E2733', light: '#FFFFFF' },
  ) {}

  create(opts: {
    x?: number,
    y?: number,
    width?: number,
    height?: number,
    minWidth?: number,
    minHeight?: number,
    parent?: BrowserWindow,
    backgroundColor?: string,
    icon?: NativeImage,
    hasShadow?: boolean,
    roundedCorners?: boolean,
    titleBarStyle?: 'hidden' | 'default',
    show?: boolean,
  }): BrowserWindow {
    const bgColor = opts.backgroundColor || (nativeTheme.shouldUseDarkColors ? this.themeColors.dark : this.themeColors.light);

    return new ElectronBrowserWindow({
      x: opts.x,
      y: opts.y,
      width: opts.width,
      height: opts.height,
      minWidth: opts.minWidth,
      minHeight: opts.minHeight,
      parent: opts.parent,
      frame: false,
      transparent: false,
      resizable: true,
      skipTaskbar: false,
      show: opts.show ?? false,
      hasShadow: opts.hasShadow ?? false,
      roundedCorners: opts.roundedCorners ?? false,
      titleBarStyle: opts.titleBarStyle ?? 'default',
      backgroundColor: bgColor,
      icon: opts.icon,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
  }
}
