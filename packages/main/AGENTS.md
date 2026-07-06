# Electron Main Process

## Purpose
Electron main process — manages application lifecycle, agent polling (Node.js `http`), native OS notifications, system tray icons, IPC between renderer and C agent, settings persistence, and desktop integration.

## Ownership
`packages/main/` directory. Bundled via esbuild to `dist/`.

## Architecture
Service classes live in `domains/`, adapters in `infrastructure/electron/`, the composition root (`AppBootstrap`) wires everything in `infrastructure/bootstrap/`. Domain code never imports `electron` directly — all electron access goes through adapter interfaces.

```
src/
├── main.ts                              # ~12 lines: creates ElectronAdapter + AppBootstrap
├── logger.ts                            # Pino logger singleton
├── settings.ts                          # Zod schema + parseSettings (pure validation)
├── gpu-validation.ts                    # Zod schemas for agent responses (pure)
├── IpcHandler.ts                        # IPC handlers (constructor-injected services)
├── MenuService.ts                       # App menu (constructor-injected services)
├── preload.ts                           # contextBridge bridge
│
├── domains/
│   ├── notifications/
│   │   ├── INotificationService.ts      # Interface
│   │   ├── INotificationDispatcher.ts   # Adapter interface (no electron)
│   │   └── NotificationService.ts       # Implementation — per-metric threshold evaluation, cooldowns
│   ├── polling/
│   │   ├── IPollingService.ts           # Interface
│   │   ├── AgentData.ts                 # AgentData + PollingHandlers types
│   │   └── PollingService.ts            # HTTP polling via IHttpAdapter
│   ├── settings/
│   │   ├── ISettingsService.ts          # Interface + ISettingsRepository
│   │   └── SettingsService.ts           # Thin facade over repository
│   ├── tray/
│   │   ├── ITrayService.ts              # Interface
│   │   ├── ITrayFactory.ts              # Adapter interface (no electron)
│   │   ├── IIconLoader.ts               # Adapter interface (no electron)
│   │   └── TrayService.ts               # Tray icon/tooltip updates
│   ├── windows/
│   │   ├── IWindowService.ts            # Interface
│   │   ├── IWindowFactory.ts            # Adapter interface (no electron)
│   │   ├── IWindowStatePersister.ts     # Adapter interface (no electron)
│   │   ├── IExternalOpener.ts           # Adapter interface (no electron)
│   │   ├── IThemeListener.ts            # Adapter interface (no electron)
│   │   └── WindowService.ts             # BrowserWindow creation + state management
│
├── infrastructure/
│   ├── bootstrap/
│   │   └── AppBootstrap.ts              # Composition root: instantiates + wires all services
│   └── electron/
│       ├── ElectronAdapter.ts           # Single bridge: aggregates all adapter instances
│       ├── ElectronNotificationDispatcher.ts
│       ├── ElectronMenuFactory.ts
│       ├── ElectronTrayFactory.ts
│       ├── ElectronIconLoader.ts
│       ├── ElectronWindowFactory.ts
│       ├── ElectronWindowStatePersister.ts
│       ├── ElectronExternalOpener.ts
│       ├── ElectronThemeListener.ts
│       └── NodeHttpAdapter.ts           # http.get wrapper
│
└── settings-persistence.ts              # DELETED — replaced by SettingsRepository
```

## Local Contracts
- Bundled with **esbuild** via `scripts/build-esbuild.js` — not webpack, not tsc alone
- Tray icons are generated programmatically at build time by `scripts/generate-icons.js` (pure Node.js, no deps)
- Settings stored at `~/.config/gpu-monitor/settings/settings.json` (gitignored)
- Preload script (`preload.ts`) exposes safe IPC bridges to the renderer — types come from `@gpu-monitor/shared` (`IElectronAPI`)
- Logger in `logger.ts` handles main-process logging
- **Settings validation**: Zod schema in `settings.ts` — `parseSettings()` for runtime validation; agent URLs validated via `agentUrlSchema` (http/https only, rejects `file://`)
- **GPU data validation**: Zod schemas in `gpu-validation.ts` — validates raw agent responses before processing (`validateGpuResponse()`)
- **Agent polling**: `PollingService` uses `IHttpAdapter` (Node.js `http.get()`) to poll agent `/gpu` + `/health` endpoints, `Promise.allSettled` for parallel polling; raw responses validated through `classifyResult()` → `validateGpuResponse()` pipeline
- **Stale detection**: runs every 5s, independent of polling interval
- **NotificationService**: lives in `domains/notifications/NotificationService.ts` — evaluates per-GPU temperature thresholds (core/junction/vram with per-metric thresholds), manages per-trigger cooldowns, fires through `INotificationDispatcher` adapter
- Tray icon and tooltip update are internal to main process (no IPC needed); tray uses per-metric evaluation (`getTempState()` + `worstState()`) so junction/vram critical temps override core-only normal state
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
- Notification dispatch is split into `dispatchMetric` / `dispatchAgentTransition` / `dispatchAllRecovered` — keep that boundary
- Tray icon uses per-metric thresholds (`getTempState()` + `worstState()`) — never compare junction/vram temps against core thresholds
- No `!` non-null assertions in polling path — use discriminated unions or null checks
- Domain services depend on adapter interfaces, not `electron` directly

## Child DOX Index
None. The `packages/main/` directory is a leaf domain.
