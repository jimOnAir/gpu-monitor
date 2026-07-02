import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } from 'electron';
import isDev from 'electron-is-dev';
import { ISettings, DEFAULT_SETTINGS } from '@gpu-monitor/shared';
import * as path from 'path';
import * as fs from 'fs';
import logger from './logger';

/** Validate settings against ISettings shape before persisting. */
function isValidSettings(data: unknown): data is ISettings {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d.agents)) return false;
  if (typeof d.refreshInterval !== 'number' || d.refreshInterval <= 0) return false;
  if (!d.thresholds || typeof d.thresholds !== 'object') return false;
  const t = d.thresholds as Record<string, unknown>;
  for (const key of ['core', 'junction', 'vram'] as const) {
    if (!t[key] || typeof t[key] !== 'object') return false;
    const entry = t[key] as Record<string, unknown>;
    if (typeof entry.warn !== 'number' || typeof entry.critical !== 'number') return false;
  }
  return true;
}

  // Set app name for proper userData path
  app.setName('gpu-monitor');

// Settings file path
const SETTINGS_DIR = path.join(app.getPath('userData'), 'settings');
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'settings.json');

// Ensure settings directory exists
if (!fs.existsSync(SETTINGS_DIR)) {
  fs.mkdirSync(SETTINGS_DIR, { recursive: true });
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let lastTrayState: 'normal' | 'warning' | 'critical' | null = null;
let willQuit = false;

// Enforce single instance: if a second launch is attempted, focus the existing window and quit the new process.
if (!app.requestSingleInstanceLock()) {
  logger.warn('Another instance is already running — exiting');
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  logger.info('Second instance attempted — focusing existing window');
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

/** Load a tray icon PNG from assets/. */
function loadIcon(name: string): Electron.NativeImage {
  let iconPath: string;

  if (app.isPackaged) {
    // In ASAR: __dirname = .../app.asar/dist/electron-app
    // Go up 2 levels to ASAR root, then to packages/main/assets
    iconPath = path.join(__dirname, '/../..', 'packages', 'main', 'assets', `${name}.png`);
  } else {
    // In dev: __dirname = packages/main/dist/electron-app
    // Go up 2 levels to packages/main/assets
    iconPath = path.join(__dirname, '../../assets', `${name}.png`);
  }

  // nativeImage.createFromPath works with ASAR paths in Electron
  const img = nativeImage.createFromPath(iconPath);
  if (img.isEmpty()) {
    logger.warn({ iconPath }, 'Icon file not found or invalid');
  } else {
    logger.info({ name, iconPath, isEmpty: img.isEmpty(), width: img.getSize().width, height: img.getSize().height }, 'Tray icon loaded');
  }
  return img;
}

/** Load the build icon (256x256) and return as NativeImage. */
function loadBuildIcon(): Electron.NativeImage {
  let iconPath: string;

  if (app.isPackaged) {
    // In ASAR: __dirname = .../app.asar/dist/electron-app
    // Go up 2 levels to ASAR root, then to build/icons
    iconPath = path.join(__dirname, '/../..', 'build', 'icons', 'icon.png');
  } else {
    // In dev: __dirname = packages/main/dist/electron-app
    // Go up 3 levels to project root, then to build/icons
    const projectRoot = path.resolve(__dirname, '../../../../');
    iconPath = path.join(projectRoot, 'build', 'icons', 'icon.png');
  }

  const img = nativeImage.createFromPath(iconPath);
  if (img.isEmpty()) {
    logger.warn({ iconPath }, 'Build icon not found, using default tray icon');
    return nativeImage.createEmpty();
  }

  logger.info({ iconPath, width: img.getSize().width, height: img.getSize().height }, 'Build icon loaded');
  return img;
}

/** Get a resized tray icon from the build icon. */
function getTrayIcon(): Electron.NativeImage {
  const buildIcon = loadBuildIcon();
  if (buildIcon.isEmpty()) {
    return loadIcon('default');
  }
  // Resize to 24x24 for tray (Electron handles scaling quality)
  return buildIcon.resize({ width: 24, height: 24 });
}

/** Get the appropriate icon based on max temperature. */
function getTempIcon(maxTemp: number, warn: number, critical: number): Electron.NativeImage {
  if (maxTemp >= critical) return loadIcon('critical');
  if (maxTemp >= warn) return loadIcon('warning');
  return loadIcon('normal');
}

/** Update tray icon only when temperature state changes. */
function updateTrayIcon(maxTemp: number, warn: number, critical: number): void {
  if (!tray) return;

  let newState: 'normal' | 'warning' | 'critical';
  if (maxTemp >= critical) {
    newState = 'critical';
  } else if (maxTemp >= warn) {
    newState = 'warning';
  } else {
    newState = 'normal';
  }

  if (newState === lastTrayState) return;
  lastTrayState = newState;
  tray.setImage(getTempIcon(maxTemp, warn, critical));
}

/** Load settings from disk, returning defaults if file doesn't exist or is invalid. */
export function loadSettings(): ISettings {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (isValidSettings(parsed)) {
        return parsed;
      }
      logger.warn('Settings file found but invalid — using defaults');
    }
  } catch (err) {
    logger.error({ err: String(err) }, 'Failed to load settings');
  }
  return { ...DEFAULT_SETTINGS };
}

/** Save settings to disk after validating against ISettings. */
export function saveSettings(settings: unknown): boolean {
  if (!isValidSettings(settings)) {
    logger.error('Refusing to save invalid settings', undefined, 'settings schema validation failed');
    return false;
  }
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
    return true;
  } catch (err) {
    logger.error({ err: String(err) }, 'Failed to save settings');
    return false;
  }
}

/** Create the system tray icon. */
function createTray(): void {
  // Start with the build icon scaled for tray; renderer updates it once GPU data arrives
  tray = new Tray(getTrayIcon());
  tray.setToolTip('GPU Monitor');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
        }
      },
    },
    {
      label: 'Refresh Agents',
      click: () => {
        mainWindow?.webContents.send('refresh-agents');
      },
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.webContents.send('open-settings');
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Exit',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
      }
    }
  });
}

/** Create the main browser window. */
function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 720,
    height: 800,
    minWidth: 520,
    minHeight: 400,
    frame: false, // frameless window for custom title bar
    transparent: false,
    resizable: true,
    skipTaskbar: false,
    icon: loadBuildIcon(), // Set app icon for system taskbar/dock
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Load the renderer
  const projectRoot = path.resolve(__dirname, '../../../../');
  mainWindow.loadFile(path.join(projectRoot, 'packages/renderer/dist/index.html'));

  mainWindow.on('close', (event) => {
    // If the user chose Exit (Cmd+Q / menu / tray), actually quit.
    // Otherwise just hide the window to the system tray.
    if (willQuit) {
      mainWindow = null;
      return;
    }
    event.preventDefault();
    mainWindow?.hide();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC handlers
ipcMain.on('window-close', () => {
  logger.info('IPC window-close');
  mainWindow?.hide();
});

ipcMain.handle('get-settings', () => {
  logger.debug('IPC get-settings');
  return loadSettings();
});

ipcMain.handle('save-settings', (_event, settings: unknown) => {
  const agents = (settings as { agents?: unknown[] })?.agents?.length ?? 0;
  logger.info({ agents }, 'IPC save-settings');
  saveSettings(settings);
  return true;
});

ipcMain.on('refresh-agents', () => {
  logger.info('IPC refresh-agents');
  mainWindow?.webContents.send('refresh-agents');
});

ipcMain.on('update-tray-temp', (_event, data: { maxTemp: number; warn: number; critical: number }) => {
  logger.debug('IPC update-tray-temp', undefined, `maxTemp=${data.maxTemp}°C`, { maxTemp: data.maxTemp });
  updateTrayIcon(data.maxTemp, data.warn, data.critical);
});

ipcMain.on('update-tray-tooltip', (_event, text: string) => {
  logger.debug('IPC update-tray-tooltip', undefined, `tooltip=${text}`);
  tray?.setToolTip(text);
});

// App lifecycle
app.whenReady().then(() => {
  logger.info('App ready');

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        role: 'appMenu',
        submenu: [
          { role: 'quit', label: 'Exit', accelerator: 'CmdOrCtrl+Q' },
        ],
      },
    ]),
  );

  createTray();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('before-quit', () => {
  willQuit = true;
});

app.on('window-all-closed', () => {
  logger.info('window-all-closed');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
