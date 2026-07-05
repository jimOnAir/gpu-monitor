import {
  DEFAULT_SETTINGS,
  EAgentStatus,
  EIPC,
} from '@gpu-monitor/shared';
import type { IAgent, IGpu } from '@gpu-monitor/shared';
import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } from 'electron';
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';

import { validateGpuResponse } from './gpu-validation';
import logger from './logger';
import { NotificationService, type AgentData, type Settings } from './notification-service';
import { settingsSchema } from './settings';

/** Validate and parse settings. Returns parsed object or null on failure. */
function parseSettings(data: unknown): Settings | null {
  const result = settingsSchema.safeParse(data);
  if (!result.success) {
    logger.warn({ errors: result.error.format() }, 'Settings validation failed');

    return null;
  }

  return result.data;
}

// ---------- Agent polling ----------

interface IGpuResponse {
  gpus: IGpu[];
  timestamp?: number;
}

/** Fetch JSON from an HTTP URL. Returns `null` on failure. Forces IPv4 to avoid ::1 connection issues. */
async function fetchJson<T = unknown>(url: string, timeoutMs = 5000): Promise<T | null> {
  return new Promise((resolve) => {
    logger.debug({ url }, 'fetchJson start');
    const req = http.get(url, { family: 4, timeout: timeoutMs }, (res) => {
      logger.debug({ url, statusCode: res.statusCode }, 'fetchJson response');
      let data = '';
      res.on('data', (chunk: Buffer) => {
        data += chunk.toString();
      });
      res.on('end', () => {
        logger.debug({ url, dataLen: data.length }, 'fetchJson end');
        try {
          resolve(JSON.parse(data) as T);
        } catch {
          logger.error({ url }, 'fetchJson parse error');
          resolve(null);
        }
      });
    });
    req.on('error', (e) => {
      logger.error({ url, error: e.message }, 'fetchJson error');
      resolve(null);
    });
    req.on('timeout', () => {
      logger.error({ url }, 'fetchJson timeout');
      req.destroy();
      resolve(null);
    });
  });
}

let pollingInterval: ReturnType<typeof setInterval> | null = null;
let staleCheckInterval: ReturnType<typeof setInterval> | null = null;
const agentData: AgentData = {
  agents: [],
  gpus: new Map(),
  lastUpdate: new Map(),
  lastFetchTimestamp: new Map(),
  statusChangedAt: new Map(),
  fetchResult: new Map(),
};

const STALE_CHECK_INTERVAL_MS = 5000;
const MIN_STALE_THRESHOLD_MS = 15000;

async function pollAgent(agent: IAgent): Promise<void> {
  const raw = await fetchAgentData(agent);
  if (!raw) {
    setAgentStatus(agent.id, EAgentStatus.Offline, 'Failed to fetch /gpu');

    return;
  }

  const classified = classifyResult(raw);
  agentData.fetchResult.set(agent.id, classified.status);
  agentData.lastFetchTimestamp.set(agent.id, Date.now());

  if (classified.status === 'ok') {
    agentData.gpus.set(agent.id, classified.gpus.gpus);
    // C agent sends timestamp in seconds; convert to milliseconds for consistency with Date.now()
    const ts = classified.gpus.timestamp ? classified.gpus.timestamp * 1000 : Date.now();
    agentData.lastUpdate.set(agent.id, ts);
    agentData.statusChangedAt.set(agent.id, Date.now());
    setAgentStatus(agent.id, EAgentStatus.Online, undefined);
  } else {
    const error = classified.status === 'fetch-failed' ? 'Failed to fetch /gpu' : undefined;
    setAgentStatus(agent.id, EAgentStatus.Offline, error);
  }
}

interface AgentFetchResult {
  gpus: IGpuResponse | null;
  healthOk: boolean;
}

type ClassifiedResult
  = | { status: 'ok', gpus: { gpus: IGpu[], timestamp?: number } }
  | { status: 'fetch-failed' }
  | { status: 'health-failed' };

async function fetchAgentData(agent: IAgent): Promise<AgentFetchResult | null> {
  const fetchUrl = `${agent.url}/gpu`;
  const healthUrl = `${agent.url}/health`;

  logger.info({ agent: agent.id, fetchUrl, healthUrl }, 'polling agent');

  return Promise.all([
    fetchJson<IGpuResponse>(fetchUrl),
    fetchJson<{ status: string }>(healthUrl),
  ]).then(([gpuData, healthData]) => {
    const hasGpus = gpuData !== null && Array.isArray(gpuData.gpus);
    logger.info({ agent: agent.id, hasGpus }, 'poll result');
    const healthOk = healthData?.status === 'ok';

    return { gpus: hasGpus ? gpuData : null, healthOk };
  });
}

function classifyResult(data: AgentFetchResult): ClassifiedResult {
  if (!data.gpus) {
    logger.warn('No GPU data returned from agent');

    return { status: 'fetch-failed' };
  }
  if (!data.healthOk) {
    logger.warn('Agent /health endpoint returned non-ok');

    return { status: 'health-failed' };
  }

  // Validate GPU data structure before trusting it
  const validated = validateGpuResponse(data.gpus);
  if (!validated) {
    logger.warn('GPU data failed validation — rejecting response');

    return { status: 'fetch-failed' };
  }

  return { status: 'ok', gpus: validated };
}

function setAgentStatus(agentId: string, status: EAgentStatus, error?: string): void {
  const existing = agentData.agents.findIndex((a) => a.id === agentId);
  if (existing < 0) {
    return;
  }
  agentData.agents[existing] = {
    ...agentData.agents[existing],
    status,
    ...(error !== undefined ? { lastError: error } : {}),
  };
}

async function refreshAllAgents(): Promise<void> {
  await Promise.allSettled(agentData.agents.map(async (a) => pollAgent(a)));
}

function checkStale(_settings: Settings): void {
  const now = Date.now();
  for (const agent of agentData.agents) {
    updateStaleStatus(agent, now);
  }
}

/** Update an agent's status based on data freshness. */
function updateStaleStatus(agent: IAgent, now: number): void {
  const lastUpdate = agentData.lastUpdate.get(agent.id) || 0;
  const age = now - lastUpdate;

  if (age > MIN_STALE_THRESHOLD_MS && agent.status === EAgentStatus.Online) {
    agent.status = EAgentStatus.Stale;
    agentData.statusChangedAt.set(agent.id, now);
  } else if (age <= MIN_STALE_THRESHOLD_MS && agent.status === EAgentStatus.Stale) {
    agent.status = EAgentStatus.Online;
    agentData.statusChangedAt.set(agent.id, now);
  }
}

function pushToRenderer(): void {
  mainWindow?.webContents.send(EIPC.GPU_DATA_UPDATE, {
    agents: agentData.agents,
    gpus: Array.from(agentData.gpus.entries()).map(([id, gpus]) => ({ agentId: id, gpus })),
    lastUpdate: Array.from(agentData.lastUpdate.entries()),
    lastFetchTimestamp: Array.from(agentData.lastFetchTimestamp.entries()),
    statusChangedAt: Array.from(agentData.statusChangedAt.entries()),
    fetchResult: Array.from(agentData.fetchResult.entries()),
  });
}

// ---------- Start polling ----------

function startPolling(settings: Settings): void {
  // Stop existing polling
  stopPolling();

  // Populate agent list from settings
  agentData.agents = settings.agents.map((a) => ({ ...a, status: EAgentStatus.Pending }));
  agentData.gpus = new Map();
  agentData.lastUpdate = new Map();
  agentData.lastFetchTimestamp = new Map();
  agentData.statusChangedAt = new Map();
  agentData.fetchResult = new Map();

  // Push initial pending state to renderer
  pushToRenderer();

  // Do an immediate refresh
  void refreshAllAgents().then(() => {
    checkStale(settings);
    notificationService.evaluateAndNotify(agentData, settings);
    updateTrayFromData();
    pushToRenderer();
  });

  // Set up polling interval
  pollingInterval = setInterval(() => {
    void refreshAllAgents().then(() => {
      checkStale(settings);
      notificationService.evaluateAndNotify(agentData, settings);
      updateTrayFromData();
      pushToRenderer();
    });
  }, settings.refreshInterval);

  // Set up stale check (independent of polling interval)
  staleCheckInterval = setInterval(() => {
    checkStale(settings);
    pushToRenderer();
  }, STALE_CHECK_INTERVAL_MS);
}

function stopPolling(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  if (staleCheckInterval) {
    clearInterval(staleCheckInterval);
    staleCheckInterval = null;
  }
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
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
  }
});

/** Load a tray icon PNG from assets/. */
function loadIcon(name: string): Electron.NativeImage {
  let iconPath: string;

  logger.info({ isPackaged: app.isPackaged, __dirname, resourcesPath: process.resourcesPath }, 'loadIcon debug');

  if (app.isPackaged) {
    // In ASAR: __dirname = .../app.asar/packages/main/dist/electron-app
    // Go up 2 levels to packages/main, then down to assets/
    iconPath = path.join(__dirname, '../../assets', `${name}.png`);
  } else {
    // In dev: __dirname = packages/main/dist/electron-app
    // Go up 2 levels to packages/main/assets
    iconPath = path.join(__dirname, '../../assets', `${name}.png`);
  }

  logger.info({ name, iconPath }, 'loadIcon resolved path');

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
    // In ASAR: __dirname = .../app.asar/packages/main/dist/electron-app
    // Go up 4 levels to ASAR root, then to build/icons
    iconPath = path.join(__dirname, '../../../..', 'build', 'icons', 'icon.png');
  } else {
    // In dev: __dirname = packages/main/dist/electron-app
    // Go up 4 levels to project root, then to build/icons
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

/** Get icon by temperature state. */
function getTempIcon(state: 'normal' | 'warning' | 'critical'): Electron.NativeImage {
  if (state === 'critical') {
    return loadIcon('critical');
  }
  if (state === 'warning') {
    return loadIcon('warning');
  }

  return loadIcon('normal');
}

/** Update tray icon only when temperature state changes. */
function updateTrayIcon(state: 'normal' | 'warning' | 'critical'): void {
  if (!tray) {
    return;
  }

  if (state === lastTrayState) {
    return;
  }
  lastTrayState = state;
  tray.setImage(getTempIcon(state));
}

/** Load settings from disk, merging with defaults for missing fields (e.g. new config keys). */
export function loadSettings(): Settings {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as unknown;
      const validated = parseSettings(parsed);
      if (validated) {
        // Merge with defaults so new fields (e.g. notifications) don't crash
        return { ...DEFAULT_SETTINGS, ...validated };
      }
      logger.warn('Settings file found but invalid — using defaults');
    }
  } catch (err) {
    logger.error({ err: String(err) }, 'Failed to load settings');
  }

  return { ...DEFAULT_SETTINGS };
}

/** Save settings to disk after validating with Zod schema. */
export function saveSettings(settings: unknown): boolean {
  const validated = parseSettings(settings);
  if (!validated) {
    logger.error('Refusing to save invalid settings', undefined, 'settings schema validation failed');

    return false;
  }
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(validated, null, 2), { mode: 0o600, encoding: 'utf-8' });

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
        const settings = loadSettings();
        void refreshAllAgents().then(() => {
          checkStale(settings);
          notificationService.evaluateAndNotify(agentData, settings);
          updateTrayFromData();
          pushToRenderer();
        });
      },
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.webContents.send(EIPC.OPEN_SETTINGS);
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
      sandbox: true,
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

// Notification service instance
const notificationService = new NotificationService();

// IPC handlers (renderer-facing — exposed via contextBridge)
ipcMain.handle(EIPC.WINDOW_CLOSE, () => {
  logger.info('IPC window-close');
  mainWindow?.hide();
  return undefined;
});

ipcMain.handle(EIPC.GET_SETTINGS, () => {
  logger.debug('IPC get-settings');
  return loadSettings();
});

ipcMain.handle(EIPC.SAVE_SETTINGS, (_event, settings: unknown) => {
  const s = settings as { agents?: unknown[] };
  const agents = s.agents && Array.isArray(s.agents) ? s.agents.length : 0;
  logger.info({ agents }, 'IPC save-settings');
  const validated = parseSettings(settings);
  if (!validated) {
    return false;
  }
  saveSettings(validated);

  // Restart polling with new settings
  startPolling(validated);

  return true;
});

/** Recompute tray icon from current agent data using per-metric thresholds. */
function updateTrayFromData(): void {
  if (!tray) {
    return;
  }

  const settings = loadSettings();
  let maxState: 'normal' | 'warning' | 'critical' = 'normal';

  for (const gpus of agentData.gpus.values()) {
    for (const gpu of gpus) {
      const coreState = getTempState(gpu.coreTemp, settings.thresholds.core);
      const junctionState = getTempState(gpu.junctionTemp, settings.thresholds.junction);
      const vramState = getTempState(gpu.vramTemp, settings.thresholds.vram);
      maxState = worstState(maxState, coreState, junctionState, vramState);
      if (maxState === 'critical') {
        break;
      }
    }
    if (maxState === 'critical') {
      break;
    }
  }

  updateTrayIcon(maxState);
}

/** Return the worst of multiple temperature states. */
function worstState(
  current: 'normal' | 'warning' | 'critical',
  ...others: Array<'normal' | 'warning' | 'critical'>
): 'normal' | 'warning' | 'critical' {
  for (const s of others) {
    if (s === 'critical') {
      return 'critical';
    }
  }
  if (current === 'warning' || others.includes('warning')) {
    return 'warning';
  }

  return 'normal';
}

/** Evaluate a single temperature against its thresholds. */
function getTempState(temp: number, thresholds: { warn: number, critical: number }): 'normal' | 'warning' | 'critical' {
  if (temp >= thresholds.critical) {
    return 'critical';
  }
  if (temp >= thresholds.warn) {
    return 'warning';
  }

  return 'normal';
}

// App lifecycle
app.whenReady().then(() => {
  logger.info('App ready');

  const settings = loadSettings();

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
  // Defer polling until the renderer is ready to receive IPC
  mainWindow?.webContents.on('did-finish-load', () => {
    logger.info('Renderer loaded — starting polling');
    startPolling(settings);
  });

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
