import type { IGpu } from './IGpu';

/** Raw `/gpu` response shape from a C agent, validated by main-process `gpu-validation.ts`. */
export interface IAgentGpuResponse {
  gpus: IGpu[];
  timestamp?: number;
  /** Agent build version (e.g. "1.0.0"); absent on agents older than 1.0.0. */
  agentVersion?: string;
}
