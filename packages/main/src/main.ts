import { app, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as fs from 'fs';
import * as path from 'path';

import { registerIpcHandlers } from './ipc-handlers';
import logger from './logger';
import { setApplicationMenu } from './menu';
import { NotificationService, type Settings } from './notification-service';
import { setPollingCallbacks, startPolling, agentData, refreshAllAgents, checkStale } from './polling';
import { loadSettings as loadSettingsFromFile } from './settings-persistence';
import { createTray, getTray, setTray, setTrayContextMenu, updateTrayIcon, worstState, getTempState } from './tray';
import { createMainWindow, createPreferencesWindow, getMainWindow, setWillQuit } from './windows';

/** Recompute tray icon and tooltip from current agent data. */
export function updateTrayFromData(): void {
  const trayInstance = getTray();
  if (!trayInstance) {
    return;
  }
  const settings = loadSettingsFromFile();
  let maxState: 'normal' | 'warning' | 'critical' = 'normal';
  const tooltipParts: string[] = [];

  for (const gpus of agentData.gpus.values()) {
    for (const gpu of gpus) {
      const coreState = getTempState(gpu.coreTemp, settings.thresholds.core);
      const junctionState = getTempState(gpu.junctionTemp, settings.thresholds.junction);
      const vramState = getTempState(gpu.vramTemp, settings.thresholds.vram);
      maxState = worstState(maxState, coreState, junctionState, vramState);
      const tempStr = `${String(gpu.coreTemp)}/${String(gpu.junctionTemp)}/${String(gpu.vramTemp)}°C`;
      const utilStr = `${String(gpu.gpuUtilization)}%`;
      const powerW = Math.round(gpu.powerUsage);
      const powerStr = `${String(powerW)}W`;
      tooltipParts.push(`${gpu.name} | ${tempStr} | ${utilStr} | ${powerStr}`);
      if (maxState === 'critical') {
        break;
      }
    }
    if (maxState === 'critical') {
      break;
    }
  }

  updateTrayIcon(maxState);

  if (tooltipParts.length > 0) {
    trayInstance.setToolTip(`GPU Monitor\n${tooltipParts.join('\n')}`);
  } else {
    trayInstance.setToolTip('GPU Monitor');
  }
}

/** Refresh all agents from tray menu. */
export async function refreshAgentsFromTray(): Promise<void> {
  const settings = loadSettingsFromFile();
  await refreshAllAgents();
  checkStale(settings);
  notificationService.evaluateAndNotify(agentData, settings);
  updateTrayFromData();
  pushToRenderer();
}

/** Push GPU data to renderer. */
function pushToRenderer(): void {
  const mainWindow = getMainWindow();
  mainWindow?.webContents.send('GPU_DATA_UPDATE', {
    agents: agentData.agents,
    gpus: Array.from(agentData.gpus.entries()).map(([id, gpus]) => ({ agentId: id, gpus })),
    lastUpdate: Array.from(agentData.lastUpdate.entries()),
    lastFetchTimestamp: Array.from(agentData.lastFetchTimestamp.entries()),
    statusChangedAt: Array.from(agentData.statusChangedAt.entries()),
    fetchResult: Array.from(agentData.fetchResult.entries()),
  });
}

/** Record a crash and check if we've exceeded the threshold. */
function recordCrash(): boolean {
  const crashLogFile = path.join(app.getPath('userData'), 'crash-log.json');
  const MAX_CRASH_COUNT = 3;
  const CRASH_WINDOW_MS = 30 * 60 * 1000;
  try {
    let crashes: Array<{ timestamp: number }> = [];
    if (fs.existsSync(crashLogFile)) {
      const raw = fs.readFileSync(crashLogFile, 'utf-8');
      const parsed = JSON.parse(raw) as { crashes?: Array<{ timestamp: number }> };
      crashes = parsed.crashes || [];
    }
    const now = Date.now();
    crashes = crashes.filter((c) => now - c.timestamp < CRASH_WINDOW_MS);
    crashes.push({ timestamp: now });
    fs.writeFileSync(crashLogFile, JSON.stringify({ crashes }, null, 2), { mode: 0o600 });

    return crashes.length >= MAX_CRASH_COUNT;
  } catch {
    return false;
  }
}

/** Record a successful startup — clears the crash log. */
function recordStartup(): void {
  const crashLogFile = path.join(app.getPath('userData'), 'crash-log.json');
  try {
    fs.writeFileSync(crashLogFile, JSON.stringify({ crashes: [] }, null, 2), { mode: 0o600 });
  } catch {
    // Silently ignore
  }
}

async function showRecoveryDialog(): Promise<void> {
  logger.warn('Crash loop detected — showing recovery dialog');
  const mainWindow = getMainWindow();
  if (!mainWindow) {
    logger.error('Main window not available for recovery dialog');
    app.quit();

    return;
  }
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'GPU Monitor',
    message: 'The app crashed multiple times on startup.',
    detail: 'Would you like to reset settings and restart?',
    buttons: ['Reset & Restart', 'Quit'],
    defaultId: 0,
    cancelId: 1,
  });
  if (result.response === 0) {
    try {
      const settingsFile = path.join(app.getPath('userData'), 'settings', 'settings.json');
      if (fs.existsSync(settingsFile)) {
        const backupPath = settingsFile + '.backup.' + String(Date.now());
        fs.renameSync(settingsFile, backupPath);
      }
      const crashLogFile = path.join(app.getPath('userData'), 'crash-log.json');
      fs.writeFileSync(crashLogFile, JSON.stringify({ crashes: [] }, null, 2), { mode: 0o600 });
      app.relaunch();
      app.exit(0);
    } catch (err) {
      logger.error({ err: String(err) }, 'Recovery failed');
      app.quit();
    }
  } else {
    app.quit();
  }
}

// ---------- App lifecycle ----------

app.setName('gpu-monitor');

const SETTINGS_DIR = path.join(app.getPath('userData'), 'settings');

if (!fs.existsSync(SETTINGS_DIR)) {
  fs.mkdirSync(SETTINGS_DIR, { recursive: true });
}

if (!app.requestSingleInstanceLock()) {
  logger.warn('Another instance is already running — exiting');
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  logger.info('Second instance attempted — focusing existing window');
  const mainWindow = getMainWindow();
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
  }
});

const notificationService = new NotificationService();

function initializeAutoUpdater(): void {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => {
    logger.info('Checking for updates...');
  });
  autoUpdater.on('update-available', (info) => {
    logger.info(`Update available: ${info.version}`);
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send('UPDATE_AVAILABLE', { version: info.version, releaseNotes: info.releaseNotes });
    }
  });
  autoUpdater.on('update-downloaded', (info) => {
    logger.info(`Update downloaded: ${info.version}`);
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send('UPDATE_DOWNLOADED', { version: info.version });
    }
  });
  autoUpdater.on('error', (err) => {
    logger.warn({ err: err.message }, 'Auto-update error');
  });
  setImmediate(() => {
    autoUpdater.checkForUpdates();
  });
}

function initializeTray(): void {
  const tray = createTray();
  setTray(tray);
  setTrayContextMenu(tray, {
    onShow: () => {
      const mainWindow = getMainWindow();
      if (mainWindow) {
        mainWindow.show();
      }
    },
    onRefresh: () => {
      const refreshSettings = loadSettingsFromFile();
      void refreshAllAgents().then(() => {
        checkStale(refreshSettings);
        notificationService.evaluateAndNotify(agentData, refreshSettings);
        updateTrayFromData();
        pushToRenderer();
      });
    },
    onOpenSettings: () => {
      const mainWindow = getMainWindow();
      createPreferencesWindow(mainWindow);
    },
    onExit: () => {
      app.quit();
    },
  });
}

function initializePolling(settings: Settings): void {
  const mainWindow = getMainWindow();
  setPollingCallbacks({
    pushToRenderer: () => {
      mainWindow?.webContents.send('GPU_DATA_UPDATE', {
        agents: agentData.agents,
        gpus: Array.from(agentData.gpus.entries()).map(([id, gpus]) => ({ agentId: id, gpus })),
        lastUpdate: Array.from(agentData.lastUpdate.entries()),
        lastFetchTimestamp: Array.from(agentData.lastFetchTimestamp.entries()),
        statusChangedAt: Array.from(agentData.statusChangedAt.entries()),
        fetchResult: Array.from(agentData.fetchResult.entries()),
      });
    },
    evaluateAndNotify: (data, notifySettings) => {
      notificationService.evaluateAndNotify(data, notifySettings);
    },
    updateTrayFromData: () => {
      updateTrayFromData();
    },
  });

  mainWindow?.webContents.on('did-finish-load', () => {
    logger.info('Renderer loaded — starting polling');
    startPolling(settings);
  });
}

app.whenReady().then(() => {
  logger.info('App ready');

  const isCrashLoop = recordCrash();
  if (isCrashLoop) {
    showRecoveryDialog();

    return;
  }
  recordStartup();

  const settings = loadSettingsFromFile();

  initializeAutoUpdater();
  registerIpcHandlers();
  setApplicationMenu();
  initializeTray();
  createMainWindow(settings);
  initializePolling(settings);

  app.on('activate', () => {
    if (!getMainWindow()) {
      createMainWindow(settings);
    }
  });
});

app.on('before-quit', () => {
  setWillQuit(true);
});

app.on('window-all-closed', () => {
  logger.info('window-all-closed');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
