# DOX framework
- DOX is highly performant AGENTS.md hierarchy installed here
- Agent must follow DOX instructions across any edits

## Core Contract
- AGENTS.md files are binding work contracts for their subtrees
- Work products, source materials, instructions, records, assets, and durable docs must stay understandable from the nearest applicable AGENTS.md plus every parent AGENTS.md above it

## Read Before Editing
1. Read the root AGENTS.md
2. Identify every file or folder you expect to touch
3. Walk from the repository root to each target path
4. Read every AGENTS.md found along each route
5. If a parent AGENTS.md lists a child AGENTS.md whose scope contains the path, read that child and continue from there
6. Use the nearest AGENTS.md as the local contract and parent docs for repo-wide rules
7. If docs conflict, the closer doc controls local work details, but no child doc may weaken DOX
Do not rely on memory. Re-read the applicable DOX chain in the current session before editing.

## Update After Editing
Every meaningful change requires a DOX pass before the task is done.
Update the closest owning AGENTS.md when a change affects:
- purpose, scope, ownership, or responsibilities
- durable structure, contracts, workflows, or operating rules
- required inputs, outputs, permissions, constraints, side effects, or artifacts
- user preferences about behavior, communication, process, organization, or quality
- AGENTS.md creation, deletion, move, rename, or index contents
Update parent docs when parent-level structure, ownership, workflow, or child index changes. Update child docs when parent changes alter local rules. Remove stale or contradictory text immediately. Small edits that do not change behavior or contracts may leave docs unchanged, but the DOX pass still must happen.

## Hierarchy
- Root AGENTS.md is the DOX rail: project-wide instructions, global preferences, durable workflow rules, and the top-level Child DOX Index
- Child AGENTS.md files own domain-specific instructions and their own Child DOX Index
- Each parent explains what its direct children cover and what stays owned by the parent
- The closer a doc is to the work, the more specific and practical it must be

## Child Doc Shape
- Create a child AGENTS.md when a folder becomes a durable boundary with its own purpose, rules, responsibilities, workflow, materials, or quality standards
- Work Guidance must reflect the current standards of the project or user instructions; if there are no specific standards or instructions yet, leave it empty
- Verification must reflect an existing check; if no verification framework exists yet, leave it empty and update it when one exists
Default section order:
- Purpose
- Ownership
- Local Contracts
- Work Guidance
- Verification
- Child DOX Index

## Style
- Keep docs concise, current, and operational
- Document stable contracts, not diary entries
- Put broad rules in parent docs and concrete details in child docs
- Prefer direct bullets with explicit names
- Do not duplicate rules across many files unless each scope needs a local version
- Delete stale notes instead of explaining history
- Trim obvious statements, repeated rules, misplaced detail, and warnings for risks that no longer exist

## Closeout
1. Re-check changed paths against the DOX chain
2. Update nearest owning docs and any affected parents or children
3. Refresh every affected Child DOX Index
4. Remove stale or contradictory text
5. Run existing verification when relevant
6. Report any docs intentionally left unchanged and why

## User Preferences
When the user requests a durable behavior change, record it here or in the relevant child AGENTS.md

## Child DOX Index

| Domain | Path | Purpose |
|--------|------|---------|
| agent | `agent/` | C daemon — GPU temperature monitoring HTTP server with NVML + /dev/mem support |
| shared | `packages/shared/` | TypeScript interfaces and enums shared between Electron main and renderer |
| main | `packages/main/` | Electron main process — polling, notification service, tray, IPC, esbuild-bundled |
| renderer | `packages/renderer/` | React dashboard UI — webpack-bundled, pure display layer, subscribes to IPC |

## Project Status

Substantially implemented. C agent (`agent/`) is ~30 KB of production code across 5 source files. Electron app has ~85 KB of working TypeScript/React/CSS across 30+ files — full UI with agent polling in main process, native OS notifications, settings management, system tray, debug panel, and detailed GPU monitoring.

See `docs/` Obsidian vault for detailed design specs that guided implementation.

## Architecture

```
agent/              # C daemon (only real code)
├── main.c          # HTTP server (microhttpd), signal handling, JSON generation
├── gpu.c/h         # NVML + /dev/mem mmap for Junction/VRAM temps
├── gpu_identity.c/h
├── logger.c/h
├── Makefile
└── README.md

packages/
├── shared/         # Types + enums only (no implementation). tsc → dist/
│   └── src/{types, enums}/
├── main/           # Electron main process. esbuild → dist/
│   └── src/{
│       main.ts, preload.ts, logger.ts, settings.ts,
│       notification-service.ts, gpu-validation.ts,
│       *.test.ts
│   }
└── renderer/       # React UI. webpack → dist/
    └── src/{
        index.tsx, App.tsx,
        components/{GpuCard, GpuDetailModal, Footer, SettingsModal, DebugPanel, GpuBar},
        domains/dashboard/DashboardService,
        styles/main.css,
        utils/constants.ts,
        preload.d.ts,
        *.test.tsx
    }
```

## IPC Flow

```
Main → Renderer: 'gpu-data-update' (push on every poll cycle)
  { agents, gpus: [{agentId, gpus}], lastUpdate, fetchResult }
Renderer → Main: getSettings, saveSettings, onWindowClose, onOpenSettings
```

## Build & Run

### Root (npm workspaces)

```bash
npm install                       # root — installs all 3 packages
npm run build                     # shared → main → renderer (sequential)
npm run start                     # concurrently starts: render dev server + electron main
npm run build:shared              # per-package: tsc
npm run build:main                # per-package: node scripts/build-esbuild.js
npm run build:render              # per-package: webpack --mode production
npm run start:render              # per-package: webpack serve --mode development
npm run start:main                # per-package: electron .
npm run lint                      # eslint across all 3 packages
npm run clean                     # removes node_modules everywhere
```

**Three different bundlers — don't assume one tool:**
- `@gpu-monitor/shared` → `tsc` (pure type compilation)
- `@gpu-monitor/main` → esbuild via `scripts/build-esbuild.js`
- `@gpu-monitor/renderer` → webpack + ts-loader (bundles HTML + JS + CSS)

### C Agent (standalone, no Node deps)

```bash
cd agent
make              # builds gputempd
sudo ./gputempd [port]   # default port 9091, or GPUTEMP_PORT env var
```

Dependencies (installed on server, not in this repo): `libnvidia-ml-dev`, `libpciaccess-dev`, `libmicrohttpd-dev`. Build flags: `-I/opt/cuda/include`.

### Agent API

| Endpoint | Returns |
|----------|---------|
| `GET /gpu` | JSON object `{timestamp, gpus: [...]}` (see `agent/README.md` for shape) |
| `GET /health` | `{"status":"ok"}` |

All env vars parsed **inline in `main.c`** — there is no config module.

## Key Constraints

- **Shared package**: interfaces, enums, and IPC types only. No implementation. Imported by both `main` and `renderer`. Contains `IElectronAPI`, `GpuDataPayload`, `FetchResult`, plus optional fields on `IAgent.status` and `IGpu` status fields.
- **No Electron in services**: platform-agnostic code in `domains/`, inject Electron via constructor.
- **Agent polling in main process**: main does HTTP fetching via Node.js `http` module. Raw responses validated via `gpu-validation.ts` Zod schemas before processing. Renderer receives data via IPC push.
- **Notifications in main process**: `NotificationService` (in `notification-service.ts`) evaluates per-metric thresholds (core/junction/vram independently) and fires `Electron.Notification`. Renderer is pure display.
- **GPU data validation**: all raw agent responses validated through `validateGpuResponse()` before being stored or used in notifications.
- **Tray icon**: uses per-metric evaluation — junction/vram critical temps override core-only normal state.
- **Settings**: stored at `~/.config/gpu-monitor/settings.json` (gitignored). Shape: `{ agents: [{id, name, url}], refreshInterval, thresholds: {core|junction|vram: {warn, critical}}, notifications: {enabled, cooldownMs} }`. Agent URLs validated to http(s) only via `agentUrlSchema`.
- **Shared constants**: `utils/constants.ts` centralizes `GB` and status helpers (`getMemoryStatus`, `getPowerStatus`, `getGpuUtilizationStatus`). Threshold values are internal to the module. Imported by `GpuCard`, `GpuDetailModal`, and tests.
- **Docs**: Obsidian vault format with wiki-links in `docs/`. The Electron App doc has the full implementation spec.
