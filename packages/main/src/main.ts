import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } from 'electron';
import isDev from 'electron-is-dev';
import * as path from 'path';
import * as fs from 'fs';
import logger from './logger';

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

/** Load a tray icon PNG from assets/. */
function loadIcon(name: string): Electron.NativeImage {
  // Dev: __dirname = packages/main/dist/electron-app/, assets at packages/main/assets/
  // Prod (asar): __dirname = main/ inside asar, assets at assets/ (one level up)
  // Note: electron-is-dev can return false when running `electron .` from the
  // package dir with "main" pointing to dist/. Detect via filesystem instead.
  const devPath = path.join(__dirname, '../../assets', `${name}.png`);
  const prodPath = path.join(__dirname, '../assets', `${name}.png`);
  const iconPath = fs.existsSync(devPath) ? devPath : prodPath;

  const img = nativeImage.createFromPath(iconPath);
  logger.info({ name, iconPath, isEmpty: img.isEmpty(), width: img.getSize().width, height: img.getSize().height }, 'Tray icon loaded');
  return img;
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

/** Load settings from disk, returning defaults if file doesn't exist. */
export function loadSettings(): unknown {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    logger.error({ err: String(err) }, 'Failed to load settings');
  }
  return null;
}

/** Save settings to disk. */
export function saveSettings(settings: unknown): void {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (err) {
    logger.error({ err: String(err) }, 'Failed to save settings');
  }
}

/** Create the system tray icon. */
function createTray(): void {
  // Start with a neutral icon; renderer updates it once GPU data arrives
  tray = new Tray(loadIcon('default'));
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
    // Don't close the app, just hide the window
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

// App lifecycle
app.whenReady().then(() => {
  logger.info('App ready');
  createTray();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  logger.info('window-all-closed');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
