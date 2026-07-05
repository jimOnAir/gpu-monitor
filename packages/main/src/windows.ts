/**
 * Window creation and management.
 * Handles main window, preferences window, and navigation guards.
 */

import type { ISettings } from '@gpu-monitor/shared';
import { EIPC } from '@gpu-monitor/shared';
import { BrowserWindow, nativeTheme, shell } from 'electron';
import windowStateKeeper from 'electron-window-state';
import * as path from 'path';

import logger from './logger';
import { loadBuildIcon } from './tray';

let mainWindow: BrowserWindow | null = null;
let preferencesWindow: BrowserWindow | null = null;
let preferencesWindowState: ReturnType<typeof windowStateKeeper> | null = null;

/** Build set of trusted origins from configured agent URLs. */
function buildTrustedOrigins(settings: ISettings): Set<string> {
  const origins = new Set<string>();
  for (const agent of settings.agents) {
    try {
      const parsed = new URL(agent.url);
      origins.add(parsed.origin);
    } catch {
      // Skip malformed URLs
    }
  }

  return origins;
}

/** Create a BrowserWindow with common settings. */
function createBaseWindow(opts: {
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
}): BrowserWindow {
  const darkBg = '#1E2733';
  const lightBg = '#FFFFFF';
  const bgColor = opts.backgroundColor || (nativeTheme.shouldUseDarkColors ? darkBg : lightBg);

  return new BrowserWindow({
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

/** Setup common window event handlers. */
function setupWindowEvents(
  win: BrowserWindow,
  stateKeeper: ReturnType<typeof windowStateKeeper>,
  onClose: () => void,
): void {
  nativeTheme.on('updated', () => {
    const bgColor = nativeTheme.shouldUseDarkColors ? '#1E2733' : '#FFFFFF';
    win.setBackgroundColor(bgColor);
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  setTimeout(() => {
    if (!win.isVisible()) {
      logger.warn('ready-to-show not fired — forcing window show');
      win.show();
    }
  }, 3000);

  win.on('focus', () => {
    win.webContents.send(EIPC.WINDOW_FOCUS);
  });
  win.on('blur', () => {
    win.webContents.send(EIPC.WINDOW_BLUR);
  });

  win.on('close', (event) => {
    event.preventDefault();
    stateKeeper.saveState(win);
    onClose();
  });

  win.on('closed', () => {
    // Handled by caller
  });
}

/** Get main window instance. */
export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

/** Get preferences window instance. */
export function getPreferencesWindow(): BrowserWindow | null {
  return preferencesWindow;
}

/** Create the main browser window. */
export function createMainWindow(settings: ISettings): void {
  const mainWindowState = windowStateKeeper({
    defaultWidth: 720,
    defaultHeight: 800,
    file: 'main-window-state.json',
  });

  mainWindow = createBaseWindow({
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
    minWidth: 520,
    minHeight: 400,
    icon: loadBuildIcon(),
  });

  mainWindowState.manage(mainWindow);

  const projectRoot = path.resolve(__dirname, '../../../../');
  mainWindow.loadFile(path.join(projectRoot, 'packages/renderer/dist/index.html'));

  const trustedOrigins = buildTrustedOrigins(settings);
  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      const parsed = new URL(url);
      if (!trustedOrigins.has(parsed.origin)) {
        event.preventDefault();
        shell.openExternal(url);
      }
    } catch {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (!trustedOrigins.has(parsed.origin)) {
        shell.openExternal(url);

        return { action: 'deny' };
      }
    } catch {
      shell.openExternal(url);

      return { action: 'deny' };
    }

    return { action: 'allow' };
  });

  setupWindowEvents(mainWindow, mainWindowState, () => {
    if (willQuit) {
      mainWindow = null;

      return;
    }
    mainWindow?.hide();
  });
}

let willQuit = false;

/** Set will quit flag. */
export function setWillQuit(value: boolean): void {
  willQuit = value;
}

/** Create the preferences window. */
export function createPreferencesWindow(parent: BrowserWindow | null): void {
  if (preferencesWindow) {
    if (preferencesWindow.isVisible()) {
      preferencesWindow.focus();

      return;
    }
    preferencesWindow.show();

    return;
  }

  preferencesWindowState = windowStateKeeper({
    defaultWidth: 600,
    defaultHeight: 500,
    file: 'preferences-window-state.json',
  });

  preferencesWindow = createBaseWindow({
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

  preferencesWindowState.manage(preferencesWindow);

  const projectRoot = path.resolve(__dirname, '../../../../');
  preferencesWindow.loadFile(path.join(projectRoot, 'packages/renderer/dist/settings.html'));

  setupWindowEvents(preferencesWindow, preferencesWindowState, () => {
    preferencesWindow?.hide();
  });
}
