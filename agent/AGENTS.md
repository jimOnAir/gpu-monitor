# C Daemon — GPU Temperature Monitor

## Purpose
Production C daemon that reads GPU temperatures via NVML and /dev/mem mmap (for Junction/VRAM temps), serves them over HTTP, and exposes a JSON API for the Electron app to poll. The agent reports **raw temperatures only** — status evaluation (normal/warning/danger) is done by the GPU Monitor app against user-configured thresholds.

## Ownership
`agent/` directory and its contents. Build artifacts (`*.o`, `gputempd`) are generated and gitignored.

## Local Contracts
- All HTTP handling and env parsing are **inline in `main.c`** — there is no `http.c/h` or `config.c/h`
- GPU count is dynamic — arrays allocated via `malloc` after detection, no fixed cap
- JSON response buffer scales dynamically: `(1 + (gpu_count + 7) / 8) * BUFFER_SIZE`
- CORS is wildcard (`*`) in production code (`main.c:179`)
- **JSON string fields escaped** via `json_escape_string()` — all string values (name, uuid, vendor, model, etc.) go through this helper before `snprintf` to prevent malformed JSON from special characters
- **Junction/VRAM sensor source**: NVAPI first (`nvapi_temps.c/h` — therm channels + Blackwell hotspot register `0xad0aa0`, ported from LACT), legacy `/dev/mem` BAR0 fallback for pre-NVAPI setups (`iomem=relaxed` required there, dead on Blackwell). Unavailable sensors emit JSON `null` (`junctionTempValid`/`vramTempValid` gate the output). Blackwell hotspot register op requires root; NVAPI calls are mutex-serialized (MHD thread-per-connection)
- **Plausible reading band (1 °C ≤ t < 255 °C)**: junction/VRAM decodes outside this band are rejected at the source (`therm_channel_value` raw < 256, `bar0_read_temp` temp < 1.0) and reported as `null` — a sub-1 °C value would serialize as `"0.0"` and be indistinguishable from a dead sensor. The app re-normalizes the same band at ingestion (ADR-0001)
- **Agent version**: `AGENT_VERSION` (`main.c`, human-bumped semver, starts at 1.0.0) is surfaced via `--version`, `/health` (`version`), and `/gpu` (`agentVersion`). Bump only when protocol or behavior changes — pre-1.0.0 binaries omit the field
- **NVAPI ABI is pinned with `_Static_assert`s** in `nvapi_temps.c` — if the struct layouts drift on a driver bump, the build fails instead of silently reading wrong bytes; re-check against LACT's `nvapi.rs` when that happens
- Power readings are in milliwatts, converted to watts at `gpu.c:108`
- Logger subsystem in `logger.c/h` handles all logging
- `--help` / `-h` flag prints usage and exits before daemon startup
- Port validation uses `strtol` with range check 1–65535 (replaces `atoi`)

## Work Guidance

### Building
```bash
cd agent && make
```
Produces `gputempd` binary. Run with `sudo ./gputempd [port]` (default 8080, or `GPUTEMP_PORT` env var).

### Deployment
Four scripts in `agent/scripts/`:
- `deploy.sh` — orchestrates local or remote deployment
- `deploy-local.sh` — deploy to local machine
- `deploy-remote.sh` — deploy to remote server
- `build-local.sh`, `build-remote.sh` — build variants

## Verification

```bash
cd agent && make && ./gputempd --help
```
Binary builds and starts without errors on a system with NVIDIA drivers installed.

## Child DOX Index
None. The `agent/` directory is a leaf domain.
