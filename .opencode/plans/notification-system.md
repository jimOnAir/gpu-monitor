# Notification System + Agent Polling Refactor

## Overview

1. **Move agent polling from renderer to main process** — main fetches GPU data via Node.js `http` module, handles stale detection, evaluates notifications, updates tray icon.
2. **Add Electron.Notification** for temperature threshold breaches and agent state changes.
3. **Delete `AgentService`** — renderer becomes pure display, subscribes to IPC events from main.

---

## Architecture

```
BEFORE:
  Renderer AgentService → fetch() → agent HTTP → renderer state
  Renderer → main (tray icon only via update-tray-temp)

AFTER:
  Main process → http.get() → agent HTTP → stale detection
                    → threshold evaluation → Electron.Notification
                    → tray icon + tooltip update
                    → IPC push 'gpu-data-update' → renderer
  Renderer → display only (subscribes to 'gpu-data-update')
```

---

## Files to Modify (9 files) + Delete (2 files)

### DELETE

| File | Reason |
|------|--------|
| `packages/renderer/src/domains/agents/AgentService.ts` | Polling moves to main |
| `packages/renderer/src/domains/agents/AgentRepository.ts` | HTTP calls move to main |

The `agent/logger.ts` stays — it may still be useful for in-app logging. The `domains/agents/` directory becomes empty and should be deleted.

---

### 1. `packages/shared/src/types/ISettings.ts` — Add notifications config

```typescript
export interface INotificationCooldowns {
  critical: number; // temp critical breaches — 60s default
  warn: number;     // temp warn breaches — 120s default
  state: number;    // agent online/offline/stale transitions — 30s default
  recover: number;  // all GPUs recovered after breach — 300s default
}

export interface INotificationsConfig {
  enabled: boolean;
  cooldownMs: INotificationCooldowns;
}

// Extend ISettings:
export interface ISettings {
  agents: IAgent[];
  refreshInterval: number;
  thresholds: ITemperatureThresholds;
  notifications: INotificationsConfig;
}

// Extend DEFAULT_SETTINGS:
notifications: {
  enabled: true,
  cooldownMs: {
    critical: 60_000,
    warn: 120_000,
    state: 30_000,
    recover: 300_000,
  },
},
```

---

### 2. `packages/main/src/main.ts` — Polling + NotificationService + tray merge

**New: Agent polling loop** (~80 lines)

Main process fetches GPU data directly from agent HTTP endpoints using Node.js `http` module (no browser `fetch`).

```typescript
import * as http from 'http';

function fetchFromAgent(url: string, path: string = '/gpu'): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeoutMs = 5000;
    const req = http.get(url + path, { timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (err) { reject(new Error(`Invalid JSON from ${url}${path}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}
```

**New: Polling state in main** (module-level variables):

```typescript
// Polling state (replaces AgentService)
let pollingAgents: IAgent[] = [];
let pollGpus = new Map<string, IGpu[]>();
let pollLastUpdate = new Map<string, number>();
let pollFetchResult = new Map<string, FetchResult>();
let pollIntervalId: ReturnType<typeof setInterval> | null = null;
let staleIntervalId: ReturnType<typeof setInterval> | null = null;
```

**New: Polling functions** (~60 lines):

```typescript
function startPolling(settings: ISettings): void {
  pollingAgents = [...settings.agents];
  stopPolling();
  pollIntervalId = setInterval(() => refreshAllAgents(), settings.refreshInterval);
  staleIntervalId = setInterval(checkStale, 5000);
  refreshAllAgents(); // initial fetch
}

function stopPolling(): void {
  if (pollIntervalId) clearInterval(pollIntervalId);
  if (staleIntervalId) clearInterval(staleIntervalId);
  pollIntervalId = null;
  staleIntervalId = null;
}

async function refreshAllAgents(): Promise<void> {
  for (const agent of pollingAgents) {
    await pollAgent(agent);
  }
  pushStateToRenderer();
}

async function pollAgent(agent: IAgent): Promise<void> {
  try {
    const gpus = await fetchFromAgent(agent.url, '/gpu');
    const isHealthy = await fetchFromAgent(agent.url, '/health');
    if (!isHealthy) throw new Error('Health check failed');

    pollGpus.set(agent.id, gpus as IGpu[]);
    pollLastUpdate.set(agent.id, Date.now());
    pollFetchResult.set(agent.id, 'ok');

    // Transition to Online if was Offline/Stale
    const currentStatus = agent.status;
    if (currentStatus === EAgentStatus.Stale || currentStatus === EAgentStatus.Offline) {
      agent.status = EAgentStatus.Online;
      agent.lastError = undefined;
    }
  } catch (err: unknown) {
    pollFetchResult.set(agent.id, 'error');
    agent.status = EAgentStatus.Offline;
    agent.lastError = err instanceof Error ? err.message : 'Unknown error';
  }
}

function checkStale(): void {
  const now = Date.now();
  const staleThreshold = Math.max(
    pollingAgents.length > 0
      ? (pollIntervalId ? 5000 * 3 : 15000)
      : 15000,
    15000,
  );

  pollingAgents.forEach((agent) => {
    const lastUpdate = pollLastUpdate.get(agent.id);
    if (!lastUpdate) return;
    const age = now - lastUpdate;

    if (age > staleThreshold && agent.status !== EAgentStatus.Stale) {
      agent.status = EAgentStatus.Stale;
      agent.lastError = 'Data stale';
    } else if (age <= staleThreshold && agent.status === EAgentStatus.Stale) {
      agent.status = EAgentStatus.Online;
      agent.lastError = undefined;
    }
  });

  pushStateToRenderer();
}

function pushStateToRenderer(): void {
  if (!mainWindow) return;
  mainWindow.webContents.send('gpu-data-update', {
    agents: [...pollingAgents],
    gpus: [...pollGpus.entries()].map(([agentId, list]) => ({ agentId, gpus: list })),
    lastUpdate: [...pollLastUpdate.entries()],
    fetchResult: [...pollFetchResult.entries()],
  });
}
```

**New: NotificationService class** (~130 lines)

State tracked in class:
- `prevStatuses: Map<string, 'normal' | 'warning' | 'danger'>` — per `(agentId:gpuIndex:metric)` key
- `allRecoveredFlags: Map<string, boolean>` — per agentId, whether breached
- `cooldowns: Map<string, number>` — per cooldown key, last notification timestamp
- `lastTrayState: 'normal' | 'warning' | 'critical' | null`

```typescript
class NotificationService {
  private prevStatuses = new Map<string, 'normal' | 'warning' | 'danger'>();
  private allRecoveredFlags = new Map<string, boolean>();
  private cooldowns = new Map<string, number>();
  private lastTrayState: 'normal' | 'warning' | 'critical' | null = null;

  evaluate(data: GpuDataPayload): void {
    const settings = loadSettings();
    if (!settings.notifications.enabled) {
      this.updateTray(data);
      return;
    }

    const notifications: Array<{ title: string; body: string; icon: string }> = [];

    // 1. Temperature evaluation per agent × GPU × metric
    for (const { agentId, gpus } of data.gpus) {
      const agent = data.agents.find((a) => a.id === agentId);
      if (!agent) continue;

      for (const gpu of gpus) {
        for (const metric of ['core', 'junction', 'vram'] as const) {
          const status = gpu[`${metric}Status`]; // 'normal' | 'warning' | 'danger'
          const key = `${agentId}:${gpu.index}:${metric}`;
          const prev = this.prevStatuses.get(key) ?? 'normal';

          if (prev !== status) {
            const payload = this.evaluateTempTransition(prev, status, metric, gpu, agent);
            if (payload && this.shouldNotify('temp', agentId, metric, settings)) {
              notifications.push(payload);
              this.prevStatuses.set(key, status);
              if (status !== 'normal') {
                this.allRecoveredFlags.set(agentId, true);
              }
            }
          }
        }
      }
    }

    // 2. Agent state transitions
    for (const agent of data.agents) {
      // Track by comparing current status — state changes detected via pushStateToRenderer
      // The agent.status is updated in pollAgent/checkStale before push
      // We need a way to track prev status. Use a separate map.
      // ... (see implementation below)
    }

    // 3. All GPUs recovered check
    for (const { agentId } of data.gpus) {
      if (this.checkAllRecovered(agentId, data.gpus)) {
        // emit all:recovered notification
      }
    }

    // 4. Show notifications
    for (const notif of notifications) {
      new Notification({ title: notif.title, body: notif.body, icon: notif.icon });
    }

    // 5. Update tray
    this.updateTray(data);
  }

  private evaluateTempTransition(prev: string, curr: string, metric: string, gpu: IGpu, agent: IAgent): NotificationPayload | null {
    if (prev === 'normal' && curr === 'danger') {
      return { title: `GPU Temperature Critical — ${gpu.name}`, body: `${capitalize(metric)}: ${gpu[`${metric}Temp`]}°C (threshold: ${settings.thresholds[metric].critical}°C) | Agent: ${agent.name}`, icon: 'critical' };
    }
    if (prev === 'normal' && curr === 'warning') {
      return { title: `GPU Temperature Warning — ${gpu.name}`, body: `${capitalize(metric)}: ${gpu[`${metric}Temp`]}°C (threshold: ${settings.thresholds[metric].warn}°C) | Agent: ${agent.name}`, icon: 'warning' };
    }
    if (prev !== 'normal' && curr === 'normal') {
      return { title: `GPU Temperature Recovered — ${gpu.name}`, body: `${capitalize(metric)} back to normal | Agent: ${agent.name}`, icon: 'normal' };
    }
    return null;
  }

  private shouldNotify(triggerType: 'temp' | 'state', agentId: string, metric: string | null, settings: ISettings): boolean {
    const cooldownKey = metric ? `temp:${triggerType}:${agentId}:${metric}` : `agent:${triggerType}:${agentId}`;
    const lastNotified = this.cooldowns.get(cooldownKey) ?? 0;
    const now = Date.now();
    const cooldown = settings.notifications.cooldownMs[triggerType === 'temp' ? (this.getTriggerCategory(triggerType, metric) as keyof INotificationCooldowns) : 'state'];
    return now - lastNotified > cooldown;
  }

  private updateTray(data: GpuDataPayload): void {
    if (!tray) return;
    let maxTemp = 0;
    for (const { gpus } of data.gpus) {
      for (const gpu of gpus) {
        maxTemp = Math.max(maxTemp, gpu.coreTemp, gpu.junctionTemp, gpu.vramTemp);
      }
    }
    const settings = loadSettings();
    let newState: 'normal' | 'warning' | 'critical';
    if (maxTemp >= settings.thresholds.core.critical) newState = 'critical';
    else if (maxTemp >= settings.thresholds.core.warn) newState = 'warning';
    else newState = 'normal';

    if (newState !== this.lastTrayState) {
      this.lastTrayState = newState;
      tray.setImage(getTempIcon(maxTemp, settings.thresholds.core.warn, settings.thresholds.core.critical));
    }
  }
}
```

**Remove from module-level in main.ts:**
- `lastTrayState` — moved into NotificationService
- Existing `getTempIcon()` function — kept (used by NotificationService.updateTray)
- Existing `updateTrayIcon()` function — removed (logic moved to NotificationService)
- Existing `update-tray-temp` IPC handler — removed

**Keep in main.ts:**
- `getTempIcon()` — used by NotificationService for tray icon
- `loadSettings()` / `saveSettings()` — settings persistence
- `update-tray-tooltip` IPC handler — keep for tooltip updates (or merge into gpu-data-update)
- `get-settings` / `save-settings` IPC handlers — settings management

**New IPC handler:**
```typescript
// Replace update-tray-temp with:
ipcMain.on('gpu-data-update-request', () => {
  // Triggered when renderer reconnects or settings change
  pushStateToRenderer();
});
```

Actually, simpler: main pushes state automatically after each poll cycle. No request needed from renderer. Just the push.

**IPC handler for polling trigger (from tray menu "Refresh Agents"):**
The existing `refresh-agents` handler already sends `refresh-agents` event to renderer. We need to instead trigger `refreshAllAgents()` in main. Update the tray menu handler:

```typescript
ipcMain.on('refresh-agents', () => {
  // Main triggers the poll, then pushes state to renderer
  refreshAllAgents();
});
```

Wait — there's a subtlety. The `refresh-agents` IPC is currently used in two places:
1. Tray menu "Refresh Agents" click → sends event to renderer → renderer calls `agentService.refreshAll()`
2. The renderer `onRefreshAgents` callback

With polling in main, the tray menu should directly call `refreshAllAgents()` in main. The renderer no longer needs to know about refreshing.

**Updated tray menu:**
```typescript
{
  label: 'Refresh Agents',
  click: () => {
    refreshAllAgents(); // main triggers poll directly
  },
},
```

---

### 3. `packages/main/src/preload.ts` — Remove old bridges, keep essentials

**Remove:**
- `updateTrayTemp` — no longer needed (tray managed in main)
- `updateTrayTooltip` — can be merged into gpu-data-update push

**Keep:**
- `getSettings`
- `saveSettings`
- `onRefreshAgents` → actually not needed anymore since main triggers refresh directly. Remove.
- `onOpenSettings` → keep (tray menu sends this to renderer)
- `onWindowClose` → keep

Actually, `onRefreshAgents` callback is no longer needed — the tray click calls `refreshAllAgents()` in main directly via IPC, and main pushes state back. The renderer doesn't need a callback.

**Final preload API:**
```typescript
contextBridge.exposeInMainWorld('electronAPI', {
  getSettings: async (): Promise<ISettings | null> => ipcRenderer.invoke('get-settings'),
  saveSettings: async (settings: ISettings): Promise<boolean> =>
    ipcRenderer.invoke('save-settings', settings) as Promise<boolean>,
  onOpenSettings: (callback: () => void) => {
    ipcRenderer.on('open-settings', () => callback());
  },
  onWindowClose: () => {
    ipcRenderer.send('window-close');
  },
  // Receive GPU data from main
  onGpuDataUpdate: (callback: (data: GpuDataPayload) => void) => {
    ipcRenderer.on('gpu-data-update', (_event, data) => callback(data));
  },
});
```

Note: `GpuDataPayload` needs to be defined. It's:
```typescript
interface GpuDataPayload {
  agents: IAgent[];
  gpus: Array<{ agentId: string; gpus: IGpu[] }>;
  lastUpdate: Array<[string, number]>;
  fetchResult: Array<[string, string]>;
}
```

---

### 4. `packages/renderer/src/preload.d.ts` — Create with new API

**Create new file:**
```typescript
import type { IAgent, IGpu, ISettings } from '@gpu-monitor/shared';

export interface GpuDataPayload {
  agents: IAgent[];
  gpus: Array<{ agentId: string; gpus: IGpu[] }>;
  lastUpdate: Array<[string, number]>;
  fetchResult: Array<[string, string]>;
}

export interface ElectronAPI {
  getSettings: () => Promise<ISettings | null>;
  saveSettings: (settings: ISettings) => Promise<boolean>;
  onOpenSettings: (callback: () => void) => void;
  onWindowClose: () => void;
  onGpuDataUpdate: (callback: (data: GpuDataPayload) => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
```

---

### 5. `packages/renderer/src/App.tsx` — Subscribe to IPC, no AgentService

**Remove:**
```typescript
import { AgentService } from './domains/agents/AgentService';
import type { AgentState } from './domains/agents/AgentService';
```

**Remove all AgentService usage:**
- `agentService.initialize(settings)` → replaced by `startPolling(settings)` call to main via IPC, or just let main auto-start on app.ready
- `agentService.subscribe(...)` → replaced by `electronAPI.onGpuDataUpdate(...)`
- `agentService.updateSettings(...)` → main reads settings from disk, no need to call
- `agentService.stopPolling()` → on unmount
- `agentState` state shape → new shape from IPC payload

**New App.tsx structure:**

```typescript
import type { ISettings } from '@gpu-monitor/shared';
import { DEFAULT_SETTINGS } from '@gpu-monitor/shared';
import React, { useState, useEffect, useCallback } from 'react';

import { DashboardService } from './domains/dashboard/DashboardService';
import { DebugPanel } from './components/DebugPanel';
import { Footer } from './components/Footer';
import { GpuCard } from './components/GpuCard';
import { GpuDetailModal } from './components/GpuDetailModal';
import { SettingsModal } from './components/SettingsModal';
import type { GpuDataPayload } from '../preload';
import './styles/main.css';

const dashboardService = new DashboardService();

export const App: React.FC = () => {
  const [settings, setSettings] = useState<ISettings>(DEFAULT_SETTINGS);
  const [agents, setAgents] = useState<IAgent[]>([]);
  const [gpusByAgentMap, setGpusByAgentMap] = useState<Map<string, IGpu[]>>(new Map());
  const [lastUpdateMap, setLastUpdateMap] = useState<Map<string, number>>(new Map());
  const [fetchResultMap, setFetchResultMap] = useState<Map<string, string>>(new Map());
  // ... rest of component
};
```

**New useEffect for IPC subscription:**
```typescript
useEffect(() => {
  if (!window.electronAPI) return;

  window.electronAPI.onGpuDataUpdate((data: GpuDataPayload) => {
    const agentsMap = new Map(data.agents.map((a) => [a.id, a]));
    const gpusMap = new Map(data.gpus.map((g) => [g.agentId, g.gpus]));
    const lastUpdate = new Map(data.lastUpdate);
    const fetchResult = new Map(data.fetchResult);

    setAgents(data.agents);
    setGpusByAgentMap(gpusMap);
    setLastUpdateMap(lastUpdate);
    setFetchResultMap(fetchResult);
  });

  // Request initial state from main
  // (main should push state on startup automatically, but this is a fallback)
  // Actually, main pushes on startup in app.whenReady(), so no explicit request needed.

  return () => {
    // Cleanup: no polling to stop since renderer doesn't poll
  };
}, []);
```

**Settings initialization:**
```typescript
useEffect(() => {
  const load = async () => {
    try {
      if (window.electronAPI) {
        const saved = await window.electronAPI.getSettings();
        if (saved) setSettings(saved);
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  };
  void load();
}, []);
```

**handleSaveSettings:**
```typescript
const handleSaveSettings = useCallback(
  async (newSettings: ISettings) => {
    setSettings(newSettings);
    if (window.electronAPI) {
      await window.electronAPI.saveSettings(newSettings);
    }
    // Main reads settings from disk on next poll — no need to call agentService.updateSettings
  },
  [],
);
```

**State shape for components:**
The `AgentState` type that components expect needs to be replaced with the new shape. Since `GpuCard`, `Footer`, `DebugPanel` all reference `AgentState`, we need to either:
- Create a new `AppState` type that mirrors `AgentState` but from IPC
- Or keep using `AgentState` type but populate it from IPC data

The cleanest approach: keep the `AgentState` type (it's still useful as a shape contract), populate it from IPC data in App.tsx, and pass it to components unchanged.

```typescript
interface AgentState {
  agents: IAgent[];
  gpus: Map<string, IGpu[]>;
  lastUpdate: Map<string, number>;
  lastFetchTimestamp: Map<string, number>;
  statusChangedAt: Map<string, number>;
  fetchResult: Map<string, string>;
}

// In App.tsx, build AgentState from IPC data:
const agentState: AgentState = {
  agents,
  gpus: gpusByAgentMap,
  lastUpdate: lastUpdateMap,
  lastFetchTimestamp: lastUpdateMap, // reuse for now
  statusChangedAt: new Map(), // not available from main yet
  fetchResult: fetchResultMap,
};
```

**DashboardService integration:**
DashboardService takes `AgentState` and returns aggregated data. Keep using it:
```typescript
const gpusByAgent = dashboardService.getGpusByAgent(agentState);
const unreachableAgents = dashboardService.getUnreachableAgents(agentState);
const lastUpdate = dashboardService.getLastUpdateTime(agentState);
```

**Remove from App.tsx:**
- All `agentService.*` references
- The tray `useEffect`s (lines 113-152)
- `updateTrayTemp` / `updateTrayTooltip` calls
- `onRefreshAgents` subscription (main triggers refresh directly)

---

### 6. `packages/renderer/src/components/SettingsModal.tsx` — Add Notifications section

Same as before — add `notifications` state, sync in `useEffect`, include in `handleSave`, add UI section.

```typescript
import type { INotificationsConfig } from '@gpu-monitor/shared';

const [notifications, setNotifications] = useState<INotificationsConfig>(settings.notifications);

// In existing useEffect:
setNotifications(settings.notifications);

// In handleSave:
const newSettings: ISettings = {
  agents,
  refreshInterval,
  thresholds,
  notifications,
};
```

UI section: same as previously designed (toggle + 4 cooldown inputs).

---

### 7. `packages/renderer/src/styles/main.css` — Notification section styles

Same as previously designed. Add at end of file.

---

## Notification Content

### Temperature breach
```
Title: "GPU Temperature Critical — RTX 4090"
Body:  "Core: 92°C (threshold: 85°C) | Agent: localhost"
Icon:  critical.png
```

### Agent state change
```
Title: "Agent Offline — localhost"
Body:  "http://192.168.1.10:9091 is unreachable"
Icon:  critical.png
```

```
Title: "Agent Online — localhost"
Body:  "http://192.168.1.10:9091 is back online"
Icon:  normal.png
```

### All GPUs recovered
```
Title: "All GPUs Recovered — localhost"
Body:  "All temperature metrics back to normal"
Icon:  normal.png
```

---

## Cooldown Keys

| Key pattern | Cooldown | Example |
|-------------|----------|---------|
| `temp:critical:{agentId}:{metric}` | 60s | `temp:critical:localhost:core` |
| `temp:warn:{agentId}:{metric}` | 120s | `temp:warn:localhost:junction` |
| `temp:recover:{agentId}:{metric}` | 60s | `temp:recover:localhost:vram` |
| `agent:offline:{agentId}` | 30s | `agent:offline:localhost` |
| `agent:online:{agentId}` | 30s | `agent:online:localhost` |
| `all:recovered:{agentId}` | 300s | `all:recovered:localhost` |

Independent per key — GPU 0 critical does NOT suppress GPU 1 warning.

---

## Edge Cases

1. **First poll after startup:** `prevStatuses` is empty → all metrics treated as 'normal'. No notifications fire on initial data. Correct behavior.
2. **Agent added/removed:** `prevStatuses` and `allRecoveredFlags` for removed agents cleaned up on next poll. New agents start fresh.
3. **Settings changed mid-poll:** `evaluate()` reads settings from disk each call. Changes take effect on next poll.
4. **Window minimized to tray:** `Electron.Notification` is OS-level — fires regardless of window state.
5. **Multiple agents:** Each agent has independent cooldowns. Cross-agent suppression impossible.
6. **Temperature oscillation:** Cooldowns prevent spam. One notification per cooldown period max.

---

## Implementation Order

1. `ISettings.ts` — shared type (affects both packages)
2. `main.ts` — add polling + stale detection + NotificationService + IPC handlers
3. `preload.ts` — update bridge (remove old, add onGpuDataUpdate)
4. `preload.d.ts` (new) — create renderer type declarations
5. `App.tsx` — remove AgentService, subscribe to IPC, rebuild agentState
6. `SettingsModal.tsx` — notifications UI section
7. `main.css` — notification section styles
8. Delete `AgentService.ts`, `AgentRepository.ts`, `agent/logger.ts`, `domains/agents/` directory
9. Build verification (`npm run build:shared && npm run build:main && npm run build:render`)
