# React Renderer UI

## Purpose
React-based GPU monitoring dashboard. Displays clickable GPU cards with temp/utilization/power, detail modals, settings management, debug panel. Pure display layer — receives data via IPC from main process.

## Ownership
`packages/renderer/` directory. Bundled with **webpack** via `webpack.config.js` to `dist/`.

## Local Contracts
- Bundled with **webpack + ts-loader** — not esbuild, not tsc alone
- Flat dashboard layout — no sidebar, no agent detail modal (removed)
- Agent context lives in the section header above each GPU grid
- CSS is in `src/styles/main.css`
- Domain services are platform-agnostic (no Electron imports in `domains/`)
- No polling — receives `gpu-data-update` via IPC from main process
- `preload.d.ts` re-exports IPC types from `@gpu-monitor/shared` (`IElectronAPI`, `GpuDataPayload`, `FetchResult`)
- `types/AgentState.ts` — `AgentState` is derived from shared `AgentData` (`Omit<AgentData, 'prevAgentStatus'>`); no hand-copied type
- **Display vocabulary** in `utils/statusDisplay.ts` — `getAgentStatusLabel`, `getStatusColor`, `formatValue`; single copy, imported by all components
- **Semantic token layer** in `:root` (`main.css`) — `--surface-hover`, `--surface-input`, `--gauge-track` (always distinct from card surface, even on hover), `--focus-ring`, `--border-strong`, `--shadow-1/2/3` depth scale, Nord-harmonized `--status-*` (`#A3BE8C`/`#EBCB8B`/`#BF616A`). Rules reference tokens; raw hex belongs only in `:root`
- **GpuBar is the only meter** — slim 8px track, fill colored by status, no text inside the bar; the row's value column carries the number (`formatValue`). The detail modal's `MetricBar` reuses `GpuBar` — no second bar implementation. Card hover is color/border only, never `transform` or `transition: all` on `.gpu-card`
- **Averages micro-line** in `utils/metricAverages.ts` — `avgDisplay()` renders the 1/5/10-min rolling averages as a `" · "`-separated 10px muted line under a metric value (`64 · 62 · 60`) with a native `title` tooltip (`1m: 64°C · 5m: 62°C · 10m: 60°C`); units only in the tooltip, integers except memory (1 decimal GB via `scale`); all-null windows render no line, partial nulls omit just that number. Renderer stays pure display — averages arrive on `GpuDataPayload.averages`, never computed here
- **Threshold helpers** in `utils/constants.ts` — `GB`, `getMemoryStatus`, `getPowerStatus`, `getGpuUtilizationStatus` (return shared `MetricStatus`); threshold values are internal to the module
- **Temperature status** is computed via shared `evaluateStatus(temp, warn, critical)` against `settings.thresholds` — the C agent no longer sends `coreStatus`/`junctionStatus`/`vramStatus`; user-configured thresholds drive UI colors. `junctionTemp`/`vramTemp` can be `null` (sensor unavailable) — `formatValue` renders `--`, `GpuBar` renders an empty track
- App uses `GpuDataPayload` (from `@gpu-monitor/shared`) for the IPC payload type directly

## Work Guidance

### Component Hierarchy
```
App.tsx (root orchestrator)
├── Title Bar (inline SVG gauge icon + "GPU Monitor" wordmark + Debug/Settings/Close buttons)
├── Main Content
│   ├── gpu-container
│   │   └── For each agent:
│   │       ├── agent-section-header (name, endpoint URL, status badge — pill with status dot)
│   │       └── gpu-grid (2-column responsive grid)
│   │           └── GpuCard (clickable → opens GpuDetailModal)
│   └── Empty state (no GPU data)
├── UpdateBanner (auto-update status: downloading / restart to install)
├── Footer (last update time, refresh interval)
├── GpuDetailModal (full GPU info, auto-updates from live state)
└── DebugPanel (floating, toggleable)

SettingsApp.tsx (separate Preferences window, own settings.html entry)
└── SettingsModal (agents, interval, thresholds, notifications)
```

**Key components:**
- **GpuCard** — compact summary (temps, utilization, power). Click opens detail modal. Temp status via shared `evaluateStatus()` against `settings.thresholds`.
- **UpdateBanner** — subscribes to `onUpdateAvailable`/`onUpdateDownloaded` IPC events; shows a dismissible banner above the footer.
- **GpuDetailModal** — full GPU breakdown (identity, temps w/ thresholds, performance, utilization, power). Resolves GPU data live from `agentState` on every render.
- **Dashboard functions** — cross-agent aggregation (groups by agent, unreachable list, timestamps, driver version).

**State flow:**
1. Main process polls agents, evaluates notifications, pushes `gpu-data-update` to renderer via IPC
2. App subscribes → rebuilds `AgentState` from payload → re-renders with new GPU data
3. Click GPU card → `selectedGpu` state set → GpuDetailModal opens
4. Modal resolves GPU live from `agentState.gpus` → updates automatically as data refreshes

### Domain Services
- `domains/dashboard/DashboardService.ts` — pure functions: `isReachable`, `getGpusByAgent`, `getUnreachableAgents`, `getLastUpdateTime`, `getDriverVersion`

### Utilities
- `utils/statusDisplay.ts` — display vocabulary: `getAgentStatusLabel`, `getStatusColor`, `formatValue`
- `utils/metricAverages.ts` — `avgDisplay()`: rolling-averages micro-line + tooltip for cards and detail modal
- `utils/constants.ts` — threshold helpers (`getMemoryStatus`, `getPowerStatus`, `getGpuUtilizationStatus`) and `GB` constant. Threshold values (memory ratios, power ratios, absolute power) are internal.
- `utils/useSettings.ts` — loads settings from Electron API on mount; used by both `App` and `SettingsApp`

### Building
```bash
npm run build:render              # webpack --mode production
npm run start:render              # webpack serve --mode development
```

## Verification

```bash
npm run build:render
```
Webpack produces `dist/` with bundled HTML, JS, and CSS.

## Child DOX Index
None. The `packages/renderer/` directory is a leaf domain.
