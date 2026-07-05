# C Daemon — GPU Temperature Monitor

## Purpose
Production C daemon that reads GPU temperatures via NVML and /dev/mem mmap (for Junction/VRAM temps), serves them over HTTP, and exposes a JSON API for the Electron app to poll.

## Ownership
`agent/` directory and its contents. Build artifacts (`*.o`, `gputempd`) are generated and gitignored.

## Local Contracts
- All HTTP handling and env parsing are **inline in `main.c`** — there is no `http.c/h` or `config.c/h`
- GPU count is dynamic — arrays allocated via `malloc` after detection, no fixed cap
- JSON response buffer scales dynamically: `(1 + (gpu_count + 7) / 8) * BUFFER_SIZE`
- CORS is wildcard (`*`) in production code (`main.c:179`)
- **JSON string fields escaped** via `json_escape_string()` — all string values (name, uuid, vendor, model, etc.) go through this helper before `snprintf` to prevent malformed JSON from special characters
- Junction/VRAM temps require `iomem=relaxed` kernel parameter — see `agent/README.md`
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
