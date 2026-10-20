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
- **Threshold helpers** in `utils/constants.ts` — `GB`, `getMemoryStatus`, `getPowerStatus`, `getGpuUtilizationStatus` (return shared `MetricStatus`); threshold values are internal to the module
- **Temperature status** is computed via shared `evaluateStatus(temp, warn, critical)` against `settings.thresholds` — the C agent no longer sends `coreStatus`/`junctionStatus`/`vramStatus`; user-configured thresholds drive UI colors. `junctionTemp`/`vramTemp` can be `null` (sensor unavailable) — `GpuBar`/`formatValue` render `--`, bars render empty
- App uses `GpuDataPayload` (from `@gpu-monitor/shared`) for the IPC payload type directly

## Work Guidance

### Component Hierarchy
```
App.tsx (root orchestrator)
├── Title Bar (🔥 GPU Monitor + Debug/Settings/Close buttons)
├── Main Content
│   ├── gpu-container
│   │   └── For each agent:
│   │       ├── agent-section-header (name, endpoint URL, status badge)
│   │       └── gpu-grid (2-column responsive grid)
│   │           └── GpuCard (clickable → opens GpuDetailModal)
 │   └── Empty state (no GPU data)
├── UpdateBanner (auto-update status: downloading / restart to install)
├── Footer (last update time, refresh interval)
├── SettingsModal (includes notifications section)
├── GpuDetailModal (full GPU info, auto-updates from live state)
└── DebugPanel (floating, toggleable)
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
