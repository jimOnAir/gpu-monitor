# Shared Types, Enums & Pure Functions

## Purpose
TypeScript interfaces, enums, and pure functions shared between the Electron main process and the renderer UI. The only runtime code allowed is `status.ts` (pure functions + `DEFAULT_SETTINGS`) and the IPC channel maps (needed at runtime by `preload.ts`).

## Ownership
`packages/shared/` directory. Consumed by both `packages/main` and `packages/renderer`.

## Local Contracts
- **Types, enums, and pure functions only** — no classes, no side effects, no I/O
- Must compile with `tsc` to produce `dist/` for consumption by both packages
- Imported as `@gpu-monitor/shared` by both `main` and `renderer`
- Keep types consistent — changes here affect both Electron processes

## Work Guidance

### Building
```bash
npm run build:shared
```
Runs `tsc` against `tsconfig.json`, outputs to `dist/`.

### Key Types
- `MetricStatus` — `'normal' | 'warning' | 'danger'` — the single status label vocabulary
- `evaluateStatus(temp, warn, critical)` — pure threshold evaluation; the single source of truth for temp-vs-threshold logic (consumed by tray, notifications, renderer)
- `worstStatus(current, ...others)` — pure; returns the worst status among the given
- `DEFAULT_SETTINGS` — default settings object (lives in `status.ts`, not `ISettings.ts`)
- `IGpu` — GPU identity, temps, utilization, power; optional extended fields: `fanSpeed`, `gpuClockMHz`, `memClockMHz`, `tempShutdown`, `tempSlowdown`, `powerCapW`, `driverVersion`, `perfState`, `vendor`, `model`, `partNumber` (the C agent no longer sends status fields — consumers compute status via `evaluateStatus`)
- `IAgent` — agent endpoint configuration; `status` is optional (defaults handled by main process)
- `ISettings` — app settings (agents list, refresh interval, thresholds, notifications config)
- `INotificationsConfig` — notifications settings (enabled, cooldowns)
- `EAgentStatus` — enum for agent connection states
- `IElectronAPI` — type-safe IPC surface exposed via `contextBridge`; consumed by both `preload.ts` and renderer
- `GpuDataPayload` — payload shape for `gpu-data-update` IPC events
- `FetchResult` — `'pending' | 'ok' | 'fetch-failed' | 'health-failed' | 'invalid'`
- `AgentData` — full runtime state (7 maps); the renderer derives `AgentState = Omit<AgentData, 'prevAgentStatus'>`

## Verification

```bash
npm run build:shared
```
Compiles without errors and produces `dist/` with declaration files.

## Child DOX Index
None. The `packages/shared/` directory is a leaf domain.
