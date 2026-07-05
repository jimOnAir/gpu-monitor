import { DEFAULT_SETTINGS, EAgentStatus } from '@gpu-monitor/shared';
import type { IAgent } from '@gpu-monitor/shared';
import type { IGpu, INotificationCooldowns, ITemperatureThresholds } from '@gpu-monitor/shared';
import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, Notification } from 'electron';
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import type { z } from 'zod';

import logger from './logger';
import { settingsSchema } from './settings';

export type Settings = z.infer<typeof settingsSchema>;

/** Validate and parse settings. Returns parsed object or null on failure. */
function parseSettings(data: unknown): Settings | null {
  const result = settingsSchema.safeParse(data);
  if (!result.success) {
    logger.warn({ errors: result.error.format() }, 'Settings validation failed');

    return null;
  }

  return result.data;
}

// ---------- Types for IPC payload ----------

type FetchResult = 'pending' | 'ok' | 'fetch-failed' | 'health-failed' | 'error';

interface AgentData {
  agents: IAgent[];
  gpus: Map<string, IGpu[]>;
  lastUpdate: Map<string, number>;
  lastFetchTimestamp: Map<string, number>;
  statusChangedAt: Map<string, number>;
  fetchResult: Map<string, FetchResult>;
}

// ---------- Notification Service ----------

type NotificationType = 'temp:critical' | 'temp:warn' | 'temp:recover' | 'agent:offline' | 'agent:online' | 'all:recovered';

const TYPE_TO_COOLDOWN_KEY: Record<NotificationType, keyof INotificationCooldowns> = {
  'temp:critical': 'tempCritical',
  'temp:warn': 'tempWarn',
  'temp:recover': 'tempRecover',
  'agent:offline': 'agentOffline',
  'agent:online': 'agentOnline',
  'all:recovered': 'allRecovered',
};

class NotificationService {
  private lastStates = new Map<string, 'normal' | 'warning' | 'critical'>();
  private allRecovered = new Map<string, boolean>();
  private cooldowns = new Map<string, number>();

  /**
   * Evaluate thresholds for all GPUs across all agents and dispatch notifications.
   */
  evaluateAndNotify(data: AgentData, settings: Settings): void {
    if (!settings.notifications.enabled) {
      return;
    }

    const { agents, gpus, fetchResult } = data;
    const hadWarning = new Set<string>();

    for (const agent of agents) {
      const gpuList = gpus.get(agent.id);
      if (!gpuList || gpuList.length === 0) {
        continue;
      }
      this.processAgent(agent, gpuList, fetchResult, hadWarning, settings);
    }

    this.resetRecoveredFlags(hadWarning);
  }

  /** Process notifications for a single agent: metrics, transitions, recovery. */
  private processAgent(
    agent: IAgent,
    gpuList: IGpu[],
    fetchResult: Map<string, FetchResult>,
    hadWarning: Set<string>,
    settings: Settings,
  ): void {
    const agentId = agent.id;
    const agentName = agent.name;
    const prev = this.lastStates.get(agentId) ?? 'normal';
    const metrics = this.gatherMetrics(gpuList, settings.thresholds);
    const cooldowns = settings.notifications.cooldowns;
    let maxStatus: 'normal' | 'warning' | 'critical' = 'normal';

    for (const metric of metrics) {
      const status = this.evaluateMetric(metric.temp, metric.warn, metric.critical);
      maxStatus = this.dispatchMetric(metric, status, prev, agentId, agentName, maxStatus, hadWarning, cooldowns);
    }

    this.dispatchAgentTransition(agentId, agentName, agent.status, fetchResult.get(agentId) === 'ok', cooldowns);
    this.lastStates.set(agentId, maxStatus);
    this.dispatchAllRecovered(agentId, agentName, metrics, hadWarning, cooldowns);
  }

  /** Dispatch a temp notification for one metric and update max status. */
  private dispatchMetric(
    metric: { metric: string, temp: number, warn: number, critical: number },
    status: 'normal' | 'warning' | 'danger',
    prev: 'normal' | 'warning' | 'critical',
    agentId: string,
    agentName: string,
    maxStatus: 'normal' | 'warning' | 'critical',
    hadWarning: Set<string>,
    cooldowns: INotificationCooldowns,
  ): 'normal' | 'warning' | 'critical' {
    if (status === 'danger') {
      return this.handleCritical(metric, agentId, agentName, cooldowns, hadWarning);
    }
    if (status === 'warning') {
      return this.handleWarning(metric, agentId, agentName, maxStatus, cooldowns, hadWarning);
    }
    this.handleRecovery(metric, status, prev, agentId, agentName, cooldowns);

    return maxStatus;
  }

  /** Handle critical temperature: fire notification and return 'critical'. */
  private handleCritical(
    metric: { metric: string, temp: number },
    agentId: string,
    agentName: string,
    cooldowns: INotificationCooldowns,
    hadWarning: Set<string>,
  ): 'critical' {
    hadWarning.add(agentId);
    this.fireNotification('temp:critical', agentId, metric.metric, agentName, `${String(metric.temp)}°C`, 'critical.png', cooldowns);

    return 'critical';
  }

  /** Handle warning temperature: update max status and fire notification. */
  private handleWarning(
    metric: { metric: string, temp: number },
    agentId: string,
    agentName: string,
    maxStatus: 'normal' | 'warning' | 'critical',
    cooldowns: INotificationCooldowns,
    hadWarning: Set<string>,
  ): 'normal' | 'warning' | 'critical' {
    if (maxStatus !== 'critical') {
      maxStatus = 'warning';
    }
    hadWarning.add(agentId);
    this.fireNotification('temp:warn', agentId, metric.metric, agentName, `${String(metric.temp)}°C`, 'warning.png', cooldowns);

    return maxStatus;
  }

  /** Handle recovery: fire notification if temp dropped below threshold. */
  private handleRecovery(
    metric: { metric: string, temp: number, warn: number, critical: number },
    _status: 'normal',
    prev: 'normal' | 'warning' | 'critical',
    agentId: string,
    agentName: string,
    cooldowns: INotificationCooldowns,
  ): void {
    if (prev === 'normal') {
      return;
    }
    const recovered = prev === 'critical' ? metric.temp < metric.critical : metric.temp < metric.warn;
    if (recovered) {
      this.fireNotification('temp:recover', agentId, metric.metric, agentName, `${String(metric.temp)}°C`, 'normal.png', cooldowns);
    }
  }

  /** Dispatch online/offline agent transition notification. */
  private dispatchAgentTransition(
    agentId: string,
    agentName: string,
    agentStatus: EAgentStatus,
    fetchOk: boolean,
    cooldowns: INotificationCooldowns,
  ): void {
    if (fetchOk && agentStatus !== EAgentStatus.Online) {
      this.fireNotification('agent:online', agentId, '', agentName, '', 'normal.png', cooldowns);
    } else if (!fetchOk && agentStatus === EAgentStatus.Offline) {
      this.fireNotification('agent:offline', agentId, '', agentName, '', 'critical.png', cooldowns);
    }
  }

  /** Dispatch "all GPUs recovered" notification when every metric returns to normal. */
  private dispatchAllRecovered(
    agentId: string,
    agentName: string,
    metrics: Array<{ status: 'normal' | 'warning' | 'danger' }>,
    hadWarning: Set<string>,
    cooldowns: INotificationCooldowns,
  ): void {
    const allNormal = metrics.every((m) => m.status === 'normal');
    if (hadWarning.size > 0 && allNormal && !this.allRecovered.get(agentId)) {
      this.allRecovered.set(agentId, true);
      this.fireNotification('all:recovered', agentId, '', agentName, '', 'normal.png', cooldowns);
    }
  }

  /** Clear allRecovered flags for agents that went back to warning. */
  private resetRecoveredFlags(hadWarning: Set<string>): void {
    for (const agentId of hadWarning) {
      if (this.allRecovered.get(agentId)) {
        this.allRecovered.set(agentId, false);
      }
    }
  }

  /** Determine status from temperature vs thresholds. */
  private evaluateMetric(temp: number, warn: number, critical: number): 'normal' | 'warning' | 'danger' {
    if (temp >= critical) {
      return 'danger';
    }
    if (temp >= warn) {
      return 'warning';
    }

    return 'normal';
  }

  /** Gather temp metrics from a GPU list with their thresholds. */
  private gatherMetrics(gpuList: IGpu[], thresholds: ITemperatureThresholds) {
    const metrics: Array<{
      metric: string,
      temp: number,
      warn: number,
      critical: number,
      status: 'normal' | 'warning' | 'danger',
    }> = [];

    const keyMap: Array<{ key: keyof ITemperatureThresholds, tempKey: keyof IGpu, statusKey: keyof IGpu }> = [
      { key: 'core', tempKey: 'coreTemp', statusKey: 'coreStatus' },
      { key: 'junction', tempKey: 'junctionTemp', statusKey: 'junctionStatus' },
      { key: 'vram', tempKey: 'vramTemp', statusKey: 'vramStatus' },
    ];

    for (const gpu of gpuList) {
      for (const { key, tempKey, statusKey } of keyMap) {
        metrics.push({
          metric: key,
          temp: gpu[tempKey] as number,
          warn: thresholds[key].warn,
          critical: thresholds[key].critical,
          status: gpu[statusKey] as 'normal' | 'warning' | 'danger',
        });
      }
    }

    return metrics;
  }

  /** Check cooldown and fire a notification if eligible. */
  private fireNotification(
    type: NotificationType,
    agentId: string,
    metric: string,
    agentName: string,
    value: string,
    icon: string,
    cooldowns: INotificationCooldowns,
  ): void {
    const cooldownKey = metric ? `${type}:${agentId}:${metric}` : `${type}:${agentId}`;
    const now = Date.now();
    const lastFire = this.cooldowns.get(cooldownKey) || 0;
    const cooldown = cooldowns[TYPE_TO_COOLDOWN_KEY[type]];

    if (now - lastFire < cooldown) {
      return;
    }

    this.cooldowns.set(cooldownKey, now);

    const title = this.buildNotificationTitle(type, agentName, metric);
    const body = this.buildNotificationBody(type, agentName, metric, value);
    const iconPath = `../../assets/${icon}`;

    const notif = new Notification({ title, body, icon: iconPath, silent: false });
    notif.show();

    logger.info({ type, agentId, metric, value }, `Notification fired: ${title}`);
  }

  private buildNotificationTitle(type: NotificationType, agentName: string, metric: string): string {
    const metricLabel = metric ? ` — ${metric.charAt(0).toUpperCase() + metric.slice(1)}` : '';
    const titles: Record<NotificationType, string> = {
      'temp:critical': `GPU Temperature Critical${metricLabel} — ${agentName}`,
      'temp:warn': `GPU Temperature Warning${metricLabel} — ${agentName}`,
      'temp:recover': `GPU Temperature Recovered${metricLabel} — ${agentName}`,
      'agent:offline': `Agent Offline — ${agentName}`,
      'agent:online': `Agent Online — ${agentName}`,
      'all:recovered': `All GPUs Recovered — ${agentName}`,
    };

    return titles[type];
  }

  private buildNotificationBody(type: NotificationType, agentName: string, metric: string, _value: string): string {
    const bodies: Record<NotificationType, string> = {
      'temp:critical': `${metric} temperature exceeded critical threshold on ${agentName}.`,
      'temp:warn': `${metric} temperature exceeded warning threshold on ${agentName}.`,
      'temp:recover': `${metric} temperature returned to normal on ${agentName}.`,
      'agent:offline': `Agent ${agentName} is not responding.`,
      'agent:online': `Agent ${agentName} is back online.`,
      'all:recovered': `All GPU temperatures on ${agentName} are within normal range.`,
    };

    return bodies[type];
  }
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
  = | { status: 'ok', gpus: IGpuResponse }
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
    return { status: 'fetch-failed' };
  }
  if (!data.healthOk) {
    return { status: 'health-failed' };
  }

  return { status: 'ok', gpus: data.gpus };
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
  mainWindow?.webContents.send('gpu-data-update', {
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

/** Get the appropriate icon based on max temperature. */
function getTempIcon(maxTemp: number, warn: number, critical: number): Electron.NativeImage {
  if (maxTemp >= critical) {
    return loadIcon('critical');
  }
  if (maxTemp >= warn) {
    return loadIcon('warning');
  }

  return loadIcon('normal');
}

/** Update tray icon only when temperature state changes. */
function updateTrayIcon(maxTemp: number, warn: number, critical: number): void {
  if (!tray) {
    return;
  }

  let newState: 'normal' | 'warning' | 'critical';
  if (maxTemp >= critical) {
    newState = 'critical';
  } else if (maxTemp >= warn) {
    newState = 'warning';
  } else {
    newState = 'normal';
  }

  if (newState === lastTrayState) {
    return;
  }
  lastTrayState = newState;
  tray.setImage(getTempIcon(maxTemp, warn, critical));
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
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(validated, null, 2), 'utf-8');

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

// Notification service instance
const notificationService = new NotificationService();

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

ipcMain.on('refresh-agents', () => {
  logger.info('IPC refresh-agents');
  const settings = loadSettings();
  void refreshAllAgents().then(() => {
    checkStale(settings);
    notificationService.evaluateAndNotify(agentData, settings);
    updateTrayFromData();
    pushToRenderer();
  });
});

ipcMain.on('update-tray-tooltip', (_event, text: string) => {
  logger.debug('IPC update-tray-tooltip', undefined, `tooltip=${text}`);
  tray?.setToolTip(text);
});

/** Recompute tray icon from current agent data. */
function updateTrayFromData(): void {
  if (!tray) {
    return;
  }

  let maxTemp = 0;
  for (const gpus of agentData.gpus.values()) {
    for (const gpu of gpus) {
      maxTemp = Math.max(maxTemp, gpu.coreTemp, gpu.junctionTemp, gpu.vramTemp);
    }
  }

  // Use core thresholds for tray (matches old behavior)
  const settings = loadSettings();
  const currentSettings = {
    agents: agentData.agents,
    refreshInterval: settings.refreshInterval,
    thresholds: settings.thresholds,
    notifications: settings.notifications,
  };

  updateTrayIcon(maxTemp, currentSettings.thresholds.core.warn, currentSettings.thresholds.core.critical);
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
