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
- Shared constants in `utils/constants.ts` — `GB` and status helpers (`getMemoryStatus`, `getPowerStatus`, `getGpuUtilizationStatus`); threshold values are internal to the module; imported by `GpuCard`, `GpuDetailModal`, and tests
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
├── Footer (last update time, refresh interval)
├── SettingsModal (includes notifications section)
├── GpuDetailModal (full GPU info, auto-updates from live state)
└── DebugPanel (floating, toggleable)
```

**Key components:**
- **GpuCard** — compact summary (temps, utilization, power). Click opens detail modal.
- **GpuDetailModal** — full GPU breakdown (identity, temps w/ thresholds, performance, utilization, power). Resolves GPU data live from `agentState` on every render.
- **DashboardService** — aggregates GPU data across agents for display (groups by agent, flattens, finds critical GPU).

**State flow:**
1. Main process polls agents, evaluates notifications, pushes `gpu-data-update` to renderer via IPC
2. App subscribes → rebuilds `AgentState` from payload → re-renders with new GPU data
3. Click GPU card → `selectedGpu` state set → GpuDetailModal opens
4. Modal resolves GPU live from `agentState.gpus` → updates automatically as data refreshes

### Domain Services
- `domains/dashboard/DashboardService.ts` — cross-agent aggregation

### Utilities
- `utils/constants.ts` — status helpers (`getMemoryStatus`, `getPowerStatus`, `getGpuUtilizationStatus`) and `GB` constant. Threshold values (memory ratios, power ratios, absolute power) are internal. `getGpuUtilizationStatus` replaces inline threshold checks in `GpuCard` and `GpuDetailModal`. Imported by `GpuCard`, `GpuDetailModal`, and their tests.

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
