# Implausible sensor readings are normalized to null at ingestion

A stale agent on the CMP 50HX fleet emitted `vramTemp: 0.0` for a dead sensor, and the app displayed `0°C`, fired false "Recovered" notifications, and poisoned rolling averages — because everywhere downstream, only `null` means "no data". We decided that `validateGpuResponse()` normalizes junction/VRAM numbers outside the plausible band (1 °C ≤ t < 255 °C) to `null`, treating *implausible readings* exactly as *unavailable readings*, while the C agent was tightened to use the same band itself.

## Considered Options

- **Reject the whole response as `invalid`** — also loses core temp and utilization, which are healthy; a per-sensor fault should not black out the agent.
- **Display the number, suppress only alerts** — leaves `0°C` in tray/UI and averages still poisoned.
- **Fix only the C agent** — agents are built and deployed on remote hosts we cannot keep version-fresh; the app must be robust to fleet drift (this is what justifies keeping the gate even after all hosts are redeployed).

## Consequences

- The null contract (skip evaluation, render `--`, skip samples, retain previous notification state) becomes the single fault path; no consumer may special-case `0`.
- The band is enforced twice (agent emits null, app re-normalizes); deliberate defense-in-depth against self-hosted fleet drift.
- When the `vramTemps` array cutover lands (wayfinder G1–G3), `normalizeSensorTemp` is applied per element.
