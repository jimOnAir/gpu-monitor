# Shared Types & Enums

## Purpose
TypeScript interfaces and enums shared between the Electron main process and the renderer UI. Contains zero implementation — only type definitions.

## Ownership
`packages/shared/` directory. Consumed by both `packages/main/` and `packages/renderer/`.

## Local Contracts
- **Interfaces and enums only** — no function bodies, no classes, no runtime code
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
- `IGpu` — GPU identity, temps, utilization, power; optional fields: `fanSpeed`, `coreStatus`/`junctionStatus`/`vramStatus` (use `?? 'normal'` default in consumers)
- `IAgent` — agent endpoint configuration; `status` is optional (defaults handled by main process)
- `ISettings` — app settings (agents list, refresh interval, thresholds, notifications config)
- `INotificationsConfig` — notifications settings (enabled, cooldownMs)
- `EAgentStatus` — enum for agent connection states
- `IElectronAPI` — type-safe IPC surface exposed via `contextBridge`; consumed by both `preload.ts` and renderer
- `GpuDataPayload` — payload shape for `gpu-data-update` IPC events
- `FetchResult` — `'pending' | 'ok' | 'fetch-failed' | 'health-failed' | 'error'`

## Verification

```bash
npm run build:shared
```
Compiles without errors and produces `dist/` with declaration files.

## Child DOX Index
None. The `packages/shared/` directory is a leaf domain.
