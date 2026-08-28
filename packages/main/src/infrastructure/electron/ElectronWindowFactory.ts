import type { BrowserWindow, NativeImage } from 'electron';
import { BrowserWindow as ElectronBrowserWindow, nativeTheme } from 'electron';
import * as path from 'path';

import type { IWindowFactory } from '../../domains/windows/IWindowFactory';
import type { IWindowHandle } from '../../domains/windows/IWindowHandle';

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
    parent?: IWindowHandle | null,
    backgroundColor?: string,
    icon?: unknown,
    hasShadow?: boolean,
    roundedCorners?: boolean,
    titleBarStyle?: 'hidden' | 'default',
    show?: boolean,
    loadFile: string,
    onReadyToShow: () => void,
    onFocus: () => void,
    onBlur: () => void,
    onClose: (event: { preventDefault: () => void }) => void,
    onWillNavigate: (event: { preventDefault: () => void }, url: string) => void,
    onWindowOpen: (url: string) => 'allow' | 'deny',
  }): IWindowHandle {
    const bgColor = opts.backgroundColor || (nativeTheme.shouldUseDarkColors ? this.themeColors.dark : this.themeColors.light);

    const win = new ElectronBrowserWindow({
      x: opts.x,
      y: opts.y,
      width: opts.width,
      height: opts.height,
      minWidth: opts.minWidth,
      minHeight: opts.minHeight,
      parent: opts.parent ? (opts.parent as unknown as BrowserWindow) : undefined,
      frame: false,
      transparent: false,
      resizable: true,
      skipTaskbar: false,
      show: opts.show ?? false,
      hasShadow: opts.hasShadow ?? false,
      roundedCorners: opts.roundedCorners ?? false,
      titleBarStyle: opts.titleBarStyle ?? 'default',
      backgroundColor: bgColor,
      icon: opts.icon as NativeImage | undefined,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    win.loadFile(opts.loadFile);

    win.once('ready-to-show', () => {
      opts.onReadyToShow();
    });
    win.on('focus', () => {
      opts.onFocus();
    });
    win.on('blur', () => {
      opts.onBlur();
    });
    win.on('close', (event) => {
      opts.onClose(event);
    });
    win.webContents.on('will-navigate', (event, url) => {
      opts.onWillNavigate(event, url);
    });
    win.webContents.setWindowOpenHandler(({ url }) => {
      return { action: opts.onWindowOpen(url) };
    });

    return {
      show: () => {
        win.show();
      },
      hide: () => {
        win.hide();
      },
      focus: () => {
        win.focus();
      },
      isMinimized: () => win.isMinimized(),
      restore: () => {
        win.restore();
      },
      isVisible: () => win.isVisible(),
      close: () => {
        win.close();
      },
      send: (channel: string, ...args: unknown[]) => {
        win.webContents.send(channel, ...args);
      },
    };
  }
}
