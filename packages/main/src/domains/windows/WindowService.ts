import { EIPC } from '@gpu-monitor/shared';
import type { ISettings } from '@gpu-monitor/shared';
import type { BrowserWindow } from 'electron';
import * as path from 'path';

import type { Logger } from '../../logger';
import type { AgentData } from '../polling/AgentData';

import type { IThemeListener, ThemeColor } from './IThemeListener';
import type { IWindowFactory } from './IWindowFactory';
import type { IWindowService } from './IWindowService';
import type { IWindowStatePersister } from './IWindowStatePersister';
import type { NavigationSecurityService } from './NavigationSecurityService';

export type BuildIconFn = () => Electron.NativeImage;

export class WindowService implements IWindowService {
  private mainWindow: BrowserWindow | null = null;
  private preferencesWindow: BrowserWindow | null = null;
  private currentPersister: IWindowStatePersister | null = null;
  private currentPersisterSave: ((window: BrowserWindow) => void) | null = null;
  private willQuit = false;

  constructor(
    private readonly logger: Logger,
    private readonly windowFactory: IWindowFactory,
    private readonly buildIcon: BuildIconFn,
    private readonly navigationSecurity: NavigationSecurityService,
    private readonly themeListener: IThemeListener,
    private readonly mainWindowStatePersister: IWindowStatePersister,
    private readonly preferencesWindowStatePersister: IWindowStatePersister,
    private readonly projectRoot: string,
  ) {}

  createMainWindow(settings: ISettings, _tray: Electron.Tray | null): void {
    const mainWindowState = this.mainWindowStatePersister.load();

    const icon = this.buildIcon();
    this.mainWindow = this.windowFactory.create({
      x: mainWindowState.x,
      y: mainWindowState.y,
      width: mainWindowState.width,
      height: mainWindowState.height,
      minWidth: 520,
      minHeight: 400,
      icon,
    });
    this.currentPersister = this.mainWindowStatePersister;
    this.mainWindowStatePersister.save(this.mainWindow);
    this.currentPersisterSave = this.mainWindowStatePersister.save.bind(this.mainWindowStatePersister);

    this.mainWindow.loadFile(path.join(this.projectRoot, 'packages/renderer/dist/index.html'));

    const trustedOrigins = this.buildTrustedOrigins(settings);
    this.mainWindow.webContents.on('will-navigate', (event, url) => {
      this.handleNavigation(event, url, trustedOrigins);
    });
    this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      return this.handleWindowOpen(url, trustedOrigins);
    });

    this.setupWindowEvents(this.mainWindow, () => {
      if (this.willQuit) {
        this.mainWindow = null;

        return;
      }
      this.mainWindow?.hide();
    });
  }

  createPreferencesWindow(parent: BrowserWindow | null): void {
    if (this.preferencesWindow) {
      if (this.preferencesWindow.isVisible()) {
        this.preferencesWindow.focus();
      } else {
        this.preferencesWindow.show();
      }

      return;
    }

    const preferencesWindowState = this.preferencesWindowStatePersister.load();

    this.preferencesWindow = this.windowFactory.create({
      x: preferencesWindowState.x,
      y: preferencesWindowState.y,
      width: preferencesWindowState.width,
      height: preferencesWindowState.height,
      minWidth: 480,
      minHeight: 400,
      parent: parent ?? undefined,
      hasShadow: true,
      roundedCorners: true,
      titleBarStyle: 'hidden',
    });
    this.currentPersister = this.preferencesWindowStatePersister;
    this.preferencesWindowStatePersister.save(this.preferencesWindow);
    this.currentPersisterSave = this.preferencesWindowStatePersister.save.bind(this.preferencesWindowStatePersister);

    this.preferencesWindow.loadFile(path.join(this.projectRoot, 'packages/renderer/dist/settings.html'));

    this.setupWindowEvents(this.preferencesWindow, () => {
      this.preferencesWindow = null;
    });
  }

  pushToRenderer(data: AgentData): void {
    this.mainWindow?.webContents.send(EIPC.GPU_DATA_UPDATE, {
      agents: data.agents,
      gpus: Array.from(data.gpus.entries()).map(([id, gpus]) => ({ agentId: id, gpus })),
      lastUpdate: Array.from(data.lastUpdate.entries()),
      lastFetchTimestamp: Array.from(data.lastFetchTimestamp.entries()),
      statusChangedAt: Array.from(data.statusChangedAt.entries()),
      fetchResult: Array.from(data.fetchResult.entries()),
    });
  }

  buildTrustedOrigins(settings: ISettings): Set<string> {
    return this.navigationSecurity.buildTrustedOrigins(settings.agents);
  }

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  getPreferencesWindow(): BrowserWindow | null {
    return this.preferencesWindow;
  }

  setPreferencesWindow(win: BrowserWindow | null): void {
    this.preferencesWindow = win;
  }

  setWillQuit(value: boolean): void {
    this.willQuit = value;
  }

  private handleNavigation(event: { preventDefault: () => void }, url: string, trustedOrigins: Set<string>): void {
    if (!this.navigationSecurity.isTrustedUrl(url, trustedOrigins)) {
      event.preventDefault();
      this.navigationSecurity.handleNavigation(url, trustedOrigins);
    }
  }

  private handleWindowOpen(url: string, trustedOrigins: Set<string>): { action: 'deny' | 'allow' } {
    if (this.navigationSecurity.isTrustedUrl(url, trustedOrigins)) {
      return { action: 'allow' };
    }
    this.navigationSecurity.handleNavigation(url, trustedOrigins);

    return { action: 'deny' };
  }

  private setupWindowEvents(win: BrowserWindow, onClose: () => void): void {
    this.themeListener.subscribe((color: ThemeColor) => {
      win.setBackgroundColor(color);
    });
    win.once('ready-to-show', () => {
      win.show();
    });
    // Note: ready-to-show only fires when win.show() is called.
    // Windows created with show: false (preferences) won't fire it.
    // The main window is shown via tray callback, so no force-show needed.
    win.on('focus', () => {
      win.webContents.send(EIPC.WINDOW_FOCUS);
    });
    win.on('blur', () => {
      win.webContents.send(EIPC.WINDOW_BLUR);
    });
    win.on('close', (event) => {
      // Save position before hiding — electron-window-state only auto-saves on 'close',
      // but we preventDefault to hide instead of close, so we must save manually.
      if (this.currentPersisterSave) {
        this.currentPersisterSave(win);
      }
      event.preventDefault();
      onClose();
    });
    win.on('closed', () => { /* handled by caller */ });
  }
}
