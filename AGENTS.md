# AGENTS.md — GPU Monitor

## Project Status

**Substantially implemented.** C agent (`agent/`) is ~30 KB of production code across 5 source files. Electron app has ~85 KB of working TypeScript/React/CSS across 30+ files — full UI with agent polling, settings management, system tray, debug panel, and detailed GPU monitoring.

See `docs/` Obsidian vault for detailed design specs that guided implementation.

## Renderer UI Structure

The renderer (`packages/renderer/src/`) uses a flat dashboard layout with clickable GPU cards:

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
├── SettingsModal
├── GpuDetailModal (full GPU info, auto-updates from live state)
└── DebugPanel (floating, toggleable)
```

**Key components:**
- **GpuCard** — compact summary (temps, utilization, power). Click opens detail modal.
- **GpuDetailModal** — full GPU breakdown (identity, temps w/ thresholds, performance, utilization, power). Resolves GPU data live from `agentState` on every render.
- **AgentService** — polls agents every `refreshInterval` (default 5s), detects stale/offline agents, manages GPU data Maps.
- **DashboardService** — aggregates GPU data across agents for display (groups by agent, flattens, finds critical GPU).

**State flow:**
1. AgentService polls agent endpoints → updates `gpus: Map<agentId, IGpu[]>`
2. App subscribes → re-renders with new GPU data
3. Click GPU card → `selectedGpu` state set → GpuDetailModal opens
4. Modal resolves GPU live from `agentState.gpus` → updates automatically as data refreshes

**Removed components:** `AgentList` (sidebar), `AgentDetailModal` (agent-level detail). Agent context now lives in the section header above each GPU grid.

## Build & Run

### C Agent (`agent/`)

```bash
cd agent
make              # builds gputempd
sudo ./gputempd [port]   # default port 9091, or GPUTEMP_PORT env var
```

Dependencies (installed on server, not in this repo): `libnvidia-ml-dev`, `libpciaccess-dev`, `libmicrohttpd-dev`. Build flags: `-I/opt/cuda/include`.

### Electron App (monorepo, npm workspaces)

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

### Agent API

| Endpoint | Returns |
|----------|---------|
| `GET /gpu` | JSON object `{timestamp, gpus: [...]}` (see `agent/README.md` for shape) |
| `GET /health` | `{"status":"ok"}` |

All env vars parsed **inline in `main.c`** — there is no config module.

## Architecture

```
agent/              # C daemon (only real code)
├── main.c          # HTTP server (microhttpd), signal handling, JSON generation
├── gpu.c/h         # NVML + /dev/mem mmap for Junction/VRAM temps
├── Makefile
└── README.md

packages/
├── shared/         # Types + enums only (no implementation). tsc → dist/
│   └── src/{types, enums}/   # IGpu, IAgent, ISettings, EAgentStatus
├── main/           # Electron main process. esbuild → dist/
│   └── src/{main.ts, preload.ts, logger.ts, domains/settings/}
└── renderer/       # React UI. webpack → dist/
    └── src/{
        index.tsx, App.tsx,
        components/{GpuCard, GpuDetailModal, Footer, SettingsModal, DebugPanel, GpuBar},
        domains/{agents/{AgentService, AgentRepository, logger}, dashboard/DashboardService},
        styles/main.css
    }
```

Key constraints:
- **Shared package**: interfaces and enums only. No implementation. Imported by both `main` and `renderer`.
- **No Electron in services**: platform-agnostic code in `domains/`, inject Electron via constructor.
- **Settings**: stored at `~/.config/gpu-monitor/settings.json` (gitignored). Shape: `{ agents: [{id, name, url}], refreshInterval, thresholds: {core|junction|vram: {warn, critical}} }`.
- **Docs**: Obsidian vault format with wiki-links in `docs/`. The Electron App doc has the full implementation spec.

## C-Specific Gotchas

- **No `http.c/h` or `config.c/h`** — all HTTP handling and env parsing are inline in `main.c`.
- **Max GPUs = 16** (hardcoded in `gpus[16]` static array and `devices[16]`).
- **JSON buffer = 8192 bytes** static — truncation possible with many GPUs.
- **CORS is wildcard** (`*`) in production code (`main.c:124`).
- **Junction/VRAM temps require `iomem=relaxed`** kernel parameter — see `agent/README.md` troubleshooting.
- **Power is milliwatts → watts** conversion in `gpu.c:92`.
