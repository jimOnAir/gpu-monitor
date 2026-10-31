# GPU Monitor

Single-context glossary for the gpu-monitor fleet: a C temperature daemon (`gputempd`) running on GPU hosts and an Electron app that polls those agents and evaluates thresholds.

## Language

### Sensor readings

**Unavailable reading**:
A sensor the agent cannot read this cycle — carried as JSON `null` from the agent. Renders as `--`, never escalates status, never enters rolling averages, never fires a notification.
_Avoid_: missing value, empty temp, zero

**Implausible reading**:
A numeric junction/VRAM reading outside the plausible band (1 °C ≤ t < 255 °C) — the hallmark of a stale agent binary or sub-1 °C fixed-point garbage. Normalized to *unavailable* at ingestion; it is never displayed or evaluated as real data.
_Avoid_: bad value, fake zero

**Invalid response**:
An agent payload that fails schema validation — the whole response is rejected (`classifyResult` → `invalid`), unlike a per-sensor implausible reading which only nulls that one sensor.
_Avoid_: malformed temp (for per-sensor cases)

**Sensor value contract**:
`null` means no data; a number always means a real measurement. The app never interprets `0` as "no data" — pre-1.0.0 agents that emitted `0.0` for dead sensors are the anti-pattern this contract forbids.

**Stale-agent fingerprint**:
Both `junctionTemp` and `vramTemp` reporting exactly `0.0` from an agent means it predates the null-reporting fix (`2219b54`) and needs redeploying. Since 1.0.0 the `agentVersion` field in `/gpu` makes this check unnecessary.

### Agents & fleet

**Agent (gputempd)**:
The C daemon on a GPU host that reports raw temperatures over HTTP. It measures; it never evaluates status.
_Avoid_: server, backend, client

**Agent version**:
Human-bumped semver (`AGENT_VERSION`) surfaced via `--version`, `/health.version`, and `/gpu.agentVersion`. Changes only when agent protocol or behavior changes.
_Avoid_: build timestamp, git hash

**Host**:
A physical machine running one or more GPUs and one agent (localhost, llm, llm2).
_Avoid_: node, server
