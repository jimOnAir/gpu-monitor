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

## Core Principles

**Dependency injection** — every dependency is explicit. Constructors take interfaces, never globals or singletons. Domain services depend on adapter interfaces (in `infrastructure/electron/`), never on the `electron` module directly. If a new dependency is needed, add it to the constructor and wire it in `AppBootstrap`.

**Single abstraction level** — each function and method operates at one level of abstraction. `domains/` contains business logic at the domain level; `infrastructure/electron/` contains implementation at the platform level. Don't mix — keep them in their respective folders. The validation pipeline (`classifyResult()` → `validateGpuResponse()`) flows linearly without re-entering layers.

## Stack & Boundaries

- **C agent** (`agent/`) — standalone daemon, builds with `make`, no Node deps. HTTP server (microhttpd) reading NVML + `/dev/mem`. Built on remote servers, not here.
- **Electron app** — three TypeScript packages under `packages/`:
  - `@gpu-monitor/shared` — **types + enums only**, no implementation. Consumed by both main and renderer.
  - `@gpu-monitor/main` — Electron main process. esbuild-bundled to `dist/electron-app/`.
  - `@gpu-monitor/renderer` — React UI. webpack-bundled to `dist/`. Separate `settings.html` entry.
- Settings live at `app.getPath('userData') + '/settings/settings.json'` (Linux: `~/.config/gpu-monitor/settings/settings.json`), gitignored.

## Build & Test Commands

```bash
npm install                          # root — all 3 packages
npm run build                        # shared → main → renderer (sequential, must be ordered)
npm run start                        # concurrently: webpack dev server + electron main
npm run build:shared                 # tsc only
npm run build:main                   # tsc type-check → icon generation → esbuild (main.ts + preload.ts)
npm run build:render                 # webpack --mode production
npm run start:render                 # webpack serve --mode development
npm run start:main                   # electron . (after build)
npm run lint                         # eslint across all 3 packages
npm run test                         # vitest run in each package (no root wrapper)
npm run package                      # build + electron-builder --linux AppImage → release/
```

**Three bundlers — don't assume one tool:**
- `shared` → `tsc` (pure type compilation to `dist/`)
- `main` → `node scripts/build-esbuild.js` (type-checks first, generates PNG icons, bundles main.ts + preload.ts)
- `renderer` → `webpack --mode production` (ts-loader, HTML + JS + CSS, two entries: `main` + `settings`)

## Architecture Notes

- **Domain/adapter pattern in main**: `domains/` has no Electron imports. `infrastructure/electron/` adapters bridge to `electron` module. `AppBootstrap` is the composition root.
- **Validation pipeline**: raw agent HTTP responses → `classifyResult()` → `validateGpuResponse()` (Zod) → stored/used. Never skip validation.
- **Notifications in main only**: `NotificationService` evaluates per-metric thresholds (core/junction/vram independently) and fires `Electron.Notification`. Renderer is pure display.
- **Tray icon uses per-metric evaluation**: junction/vram critical temps override core-only normal state. 4 states: default(gray), normal(green), warning(yellow), critical(red).
- **Agent polling via Node.js `http`**: main process fetches, not renderer. `Promise.allSettled` for parallel agent polling.
- **Settings validation**: Zod schema in `settings.ts`. Agent URLs validated via `agentUrlSchema` (http/https only, rejects `file://`).
- **Preload** (`preload.ts`): `contextBridge` bridge exposing `IElectronAPI` types from `@gpu-monitor/shared`.

## IPC

- **Main → Renderer**: `gpu-data-update` — full agent+GPU state, every poll cycle.
- **Renderer → Main**: `get-settings`, `save-settings`, `on-window-close`, `open-preferences`, `close-preferences`.
- Tray "Refresh Agents" calls polling directly (no IPC).

## Testing

- **Unit**: vitest in `packages/main/` (node env) and `packages/renderer/` (jsdom env).
- **E2E**: Playwright in `e2e/`, launches built Electron app. Requires `npm run build` first. Run: `npx playwright test`.
- Vitest configs alias `@gpu-monitor/shared` to `../shared/src/index.ts` (source, not dist).

## Gotchas

- **esbuild build type-checks first**: `build:main` runs `npx tsc --noEmit` before bundling — type errors abort the build.
- **PNG CRC must cover type+data only**, not the length field, or Electron rejects the image.
- **Tray icon paths**: from `dist/electron-app/`, assets are at `../../assets/`. Build icon is 256×256 from project root.
- **CSP nonces in renderer**: generated at webpack build time. Two entries (`main` + `settings`) each get their own nonce.
- **Settings modal is a separate window**: `settings.html` with its own webpack entry, separate CSP nonce, separate preload bridge.
- **Agent URLs in settings**: validated at save time. `file://` and other schemes rejected.
- **No module-level singletons** in main process — tray, windows, polling state are instance fields on services.
- **No default params in service constructors** — every dependency explicit.
- **`.fallow/` directory**: fallow analysis config present. Run `npx fallow audit --base HEAD` after changes to `main.ts`.
- **Three different dev servers**: `npm start` runs concurrently, but for focused work use `npm run start:render` (webpack dev HMR) or `npm run start:main` (electron only, needs prior build).

## Child DOX Index

| Domain | Path | Purpose |
|--------|------|---------|
| agent | `agent/` | C daemon — GPU temperature monitoring HTTP server with NVML + /dev/mem support |
| shared | `packages/shared/` | TypeScript interfaces and enums shared between Electron main and renderer |
| main | `packages/main/` | Electron main process — polling, notification service, tray, IPC, esbuild-bundled |
| renderer | `packages/renderer/` | React dashboard UI — webpack-bundled, pure display layer, subscribes to IPC |
