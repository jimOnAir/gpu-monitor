import type { EAgentStatus } from '../enums/EAgentStatus';

import type { IAgent } from './IAgent';
import type { IGpu } from './IGpu';
import type { IGpuAverages } from './IGpuAverages';

/**
 * Fetch result state for an individual agent poll cycle.
 * Defined in shared so both main (polling) and renderer (display) use the same type.
 */
export type FetchResult = 'pending' | 'ok' | 'fetch-failed' | 'health-failed' | 'invalid';

/**
 * Complete runtime state of all monitored agents and their GPUs.
 * Serialized across IPC as GpuDataPayload and reconstructed in the renderer.
 */
export interface AgentData {
  agents: IAgent[];
  gpus: Map<string, IGpu[]>;
  lastUpdate: Map<string, number>;
  lastFetchTimestamp: Map<string, number>;
  statusChangedAt: Map<string, number>;
  fetchResult: Map<string, FetchResult>;
  /** Previous agent status before the current poll cycle — used for transition detection. */
  prevAgentStatus: Map<string, EAgentStatus>;
  /** Rolling 1/5/10-min averages, index-aligned with `gpus`. Frozen while an agent is stale/offline. */
  averages: Map<string, IGpuAverages[]>;
}
