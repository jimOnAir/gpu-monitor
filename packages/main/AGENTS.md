# Electron Main Process

## Purpose
Electron main process — manages application lifecycle, agent polling (Node.js `http`), native OS notifications, system tray icons, IPC between renderer and C agent, settings persistence, and desktop integration.

## Ownership
`packages/main/` directory. Bundled via esbuild to `dist/`.

## Architecture
Service classes live in `domains/`, adapters in `infrastructure/electron/`, the composition root (`AppBootstrap`) wires everything in `infrastructure/bootstrap/`. Domain code never imports `electron` directly — all electron access goes through adapter interfaces.

```
src/
├── main.ts                              # creates adapters + AppBootstrap
├── logger.ts                            # Pino logger singleton
├── settings.ts                          # Zod schema + parseSettings (pure validation)
├── gpu-validation.ts                    # Zod schemas for agent responses (pure)
├── IpcHandler.ts                        # IPC handlers (constructor-injected services)
├── MenuService.ts                       # App menu (constructor-injected services)
├── preload.ts                           # contextBridge bridge
│
├── domains/
│   ├── ICrashRecoveryService.ts         # Crash-log interface (adapter: ElectronCrashRecoveryService)
 │   ├── lifecycle/
 │   │   ├── IAppLifecycle.ts             # Adapter interface (app events, quit/relaunch)
 │   │   ├── IAutoUpdater.ts              # Adapter interface (electron-updater)
 │   │   └── LifecycleService.ts          # second-instance, activate (ensureMainWindow), before-quit, updater events
 │   ├── menu/
 │   │   └── IMenuFactory.ts              # Adapter interface (no electron types)
│   ├── notifications/
│   │   ├── INotificationService.ts      # Interface
│   │   ├── INotificationDispatcher.ts   # Adapter interface (no electron)
│   │   └── NotificationService.ts       # Threshold eval + cooldowns + transitions (self-contained)
│   ├── polling/
│   │   ├── IPollingService.ts           # Interface
│   │   ├── AgentData.ts                 # PollingHandlers type (AgentData from shared)
│   │   ├── AgentPoller.ts               # HTTP fetch + classifyResult (pure classification)
│   │   ├── PollingService.ts            # Owns active settings + the poll cycle (runCycle)
│   │   └── StaleDetector.ts             # Stale detection (15s threshold)
 │   ├── recovery/
 │   │   ├── IDialogAdapter.ts            # Adapter interface (native message boxes)
 │   │   └── RecoveryService.ts           # Crash-loop policy: dialog + settings backup (via ISettingsRepository)
 │   ├── settings/
 │   │   ├── ISettingsService.ts          # ISettingsRepository interface (load/save/backup)
 │   │   ├── IFileStorage.ts              # Adapter interface (fs, no node types)
 │   │   └── SettingsRepository.ts        # File IO + Zod validation + backup
│   ├── tray/
│   │   ├── ITrayService.ts              # Interface (no electron types)
│   │   ├── ITrayHandle.ts               # Domain abstraction over the tray object
│   │   ├── ITrayFactory.ts              # Adapter interface (no electron types)
│   │   ├── IIconLoader.ts               # Adapter interface (no electron)
│   │   └── TrayService.ts               # Tray icon/tooltip updates
│   └── windows/
│       ├── IWindowService.ts            # Interface (no electron types)
│       ├── IWindowHandle.ts             # Domain abstraction over a window
│       ├── IWindowFactory.ts            # Adapter interface (returns IWindowHandle)
│       ├── IWindowStatePersister.ts     # Adapter interface (no electron types)
│       ├── IExternalOpener.ts           # Adapter interface (no electron)
│       ├── IThemeListener.ts            # Adapter interface (no electron)
│       ├── NavigationSecurityService.ts # URL trust validation (pure)
│       └── WindowService.ts             # Window lifecycle + state management
│
├── infrastructure/
│   ├── bootstrap/
│   │   └── AppBootstrap.ts              # Composition root: wires services, no behavior
│   └── electron/
│       ├── ElectronAdapter.ts           # Adapter aggregate (appPath, projectRoot, persister factory)
│       ├── ElectronAppLifecycle.ts      # app.on(second-instance/activate/before-quit)
│       ├── ElectronAutoUpdater.ts       # electron-updater wrapper
│       ├── ElectronCrashRecoveryService.ts
│       ├── ElectronDialogAdapter.ts     # dialog.showMessageBox wrapper
│       ├── ElectronExternalOpener.ts
│       ├── ElectronIconLoader.ts
│       ├── ElectronMenuFactory.ts
│       ├── ElectronNotificationDispatcher.ts
│       ├── ElectronThemeListener.ts
│       ├── ElectronTrayFactory.ts       # Wraps Tray in ITrayHandle
│       ├── ElectronWindowFactory.ts     # Wraps BrowserWindow in IWindowHandle
│       ├── ElectronWindowStatePersister.ts
│       ├── NodeFileStorage.ts
│       └── NodeHttpAdapter.ts           # http.get wrapper
```

## Local Contracts
- Bundled with **esbuild** via `scripts/build-esbuild.js` — not webpack, not tsc alone
- Tray icons are generated programmatically at build time by `scripts/generate-icons.js` (pure Node.js, no deps)
- Settings stored at `~/.config/gpu-monitor/settings/settings.json` (gitignored)
- Preload script (`preload.ts`) exposes safe IPC bridges to the renderer — types come from `@gpu-monitor/shared` (`IElectronAPI`)
- Logger in `logger.ts` handles main-process logging
- **Settings validation**: Zod schema in `settings.ts` — `parseSettings()` for runtime validation; agent URLs validated via `agentUrlSchema` (http/https only, rejects `file://`)
- **GPU data validation**: Zod schemas in `gpu-validation.ts` — validates raw agent responses before processing (`validateGpuResponse()`); `junctionTemp`/`vramTemp` accept `number | null`
- **Agent polling**: `PollingService` owns the active settings and the poll cycle (`runCycle`: fetch → classify → stale → notify → tray → push). All entry points (poll interval, stale-check interval, `refreshAgents()`) run the same cycle. `AgentPoller` fetches `/gpu` + `/health` in parallel (timeout enforced by `IHttpAdapter`); `classifyResult()` → `validateGpuResponse()` pipeline classifies as `ok` / `fetch-failed` / `health-failed` / `invalid`
- **Stale detection**: runs every 5s as part of the poll cycle, independent of the polling interval
- **NotificationService**: self-contained (constructor: logger + dispatcher) — evaluates per-GPU temperature thresholds via shared `evaluateStatus()`, tracks per-metric previous state (`agentId:metric` keys), per-agent warned flags, and per-trigger cooldowns; fires through `INotificationDispatcher` adapter. Metrics with `null` temperature (sensor unavailable) are skipped entirely — no notification, no recovery, previous state retained
- **Threshold evaluation**: single source of truth is `evaluateStatus()` / `worstStatus()` in `@gpu-monitor/shared` — consumed by tray, notifications, and renderer. One label vocabulary: `normal | warning | danger`
- Tray icon and tooltip update are internal to main process (no IPC needed); tray uses per-metric evaluation via shared `evaluateStatus()` so junction/vram critical temps override core-only normal state; null temps render `--` in the tooltip and never escalate the icon
- **Window/tray handles**: `IWindowHandle` and `ITrayHandle` are domain abstractions — `IWindowService` and `ITrayService` contain no electron types; the Electron adapters wrap `BrowserWindow`/`Tray` to satisfy them
- **No module-level singletons** — tray, windows, and polling state are instance fields on their services
- **No callback injection anti-pattern** — `setPollingCallbacks()` is replaced by `PollingService.registerHandlers()` with typed interface

## Work Guidance

### Icon System
4 tray icon states, all 24×24 PNG, 8-bit RGBA:
- `assets/default.png` — gray background, launch/no data
- `assets/normal.png` — green background, all GPUs below warn
- `assets/warning.png` — yellow background, ≥1 GPU above warn
- `assets/critical.png` — red background, ≥1 GPU above critical

Generated by `generateIcon(size, bgR, bgG, bgB, accentR, accentG, accentB)` in `scripts/generate-icons.js`.

Build icon (`build/icons/icon.png`) is 256×256, loaded by `ElectronAdapter.buildTrayIcon()`.

### Notification Triggers
| Trigger | Cooldown | Example |
|---------|----------|---------|
| `temp:critical:{agent}:{metric}` | 60s | "GPU Temperature Critical — Core — RTX 4090" |
| `temp:warn:{agent}:{metric}` | 120s | "GPU Temperature Warning — Junction — RTX 4090" |
| `temp:recover:{agent}:{metric}` | 60s | "GPU Temperature Recovered — Core — RTX 4090" |
| `agent:offline:{agent}` | 30s | "Agent Offline — localhost" |
| `agent:online:{agent}` | 30s | "Agent Online — localhost" |
| `all:recovered:{agent}` | 300s | "All GPUs Recovered — localhost" |

Notifications respect `settings.notifications.enabled` and use per-trigger cooldowns keyed by `(type, agentId, metric)`.

### IPC Events
- **Main → Renderer**: `gpu-data-update` — pushes full agent+GPU state on every poll cycle. Payload shape: `GpuDataPayload` (from `@gpu-monitor/shared`)
- **Main → Renderer**: `update-available` / `update-downloaded` — auto-updater events (version + release notes). Consumed by `UpdateBanner` in the renderer.
- **Renderer → Main**: `get-settings`, `save-settings`, `on-window-close`, `open-preferences`, `close-preferences` — types defined in `@gpu-monitor/shared` (`IElectronAPI`)
- Tray menu "Refresh Agents" calls polling directly (no IPC round-trip)

### Building
```bash
npm run build:main
```
Runs `node scripts/build-esbuild.js` which calls `generateIcons()` then esbuilds.

### Desktop Integration
```bash
npm run install:desktop
```
Copies icon + `.desktop` file to `~/.local/share/`.

### Gotchas
- **PNG CRC must cover type+data only**, NOT the length field. Wrong CRC → Electron rejects the image as empty.
- **Tray path**: from `dist/electron-app/` the assets are at `../../assets/`.
- **Build icon path**: from `dist/electron-app/` the project root is `../../../../`.
- **Tray behavior**: `tray.setContextMenu()` sets the context menu (right-click shows it). Left-click toggles window visibility. Double-click shows window. Menu is built once via `trayFactory.buildContextMenu([...])` and applied once via `trayFactory.setContextMenu(tray, menu)`.
- **Notification icons**: use relative path `../../assets/critical.png` etc. — Electron `Notification` resolves from the renderer process.
- **Polling uses Node.js `http`**: main process fetches agent data, not the renderer.
- **Domain files never import `electron`** — if you see `import { Notification } from 'electron'` in `domains/`, it belongs in `infrastructure/electron/` instead.
- **No default parameters in service constructors** — every dependency is explicit.
- **Types defined once** — `ISettings` in `@gpu-monitor/shared`, `AgentData` in `domains/polling/AgentData.ts`. Import everywhere else.

## Verification

```bash
npm run build:main
```
esbuild produces `dist/electron-app/` with all assets present.

### Code Quality

Run **fallow audit** after any change to `main.ts` before committing:

```bash
npx fallow audit --base HEAD
```

Key rules:
- NotificationService methods must stay below CC20 — split further if they grow
- All `fetchJson` calls must use the generic form `fetchJson<T>(url)` — no `as` casts on results
- All fetched GPU data must pass through `validateGpuResponse()` before being used
- Settings validation uses Zod schema (`settingsSchema.parse()`) — never `typeof` checks
- Agent URLs validated via `agentUrlSchema` (http/https only) — never accept `file://` or other schemes
- Notification dispatch is split into `dispatchMetric` / `processAgentTransition` / `dispatchAllRecovered` — keep that boundary
- Threshold evaluation always goes through shared `evaluateStatus()` — never reimplement temp-vs-threshold logic in main or renderer
- Domain interfaces never expose electron types — use `IWindowHandle` / `ITrayHandle` abstractions
- No `!` non-null assertions in polling path — use discriminated unions or null checks
- Domain services depend on adapter interfaces, not `electron` directly

## Child DOX Index
None. The `packages/main/` directory is a leaf domain.
