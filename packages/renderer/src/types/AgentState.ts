/**
 * Renderer-side AgentState is an alias for the shared AgentData type.
 * This eliminates type duplication between main and renderer packages.
 */
import type { IAgent, IGpu } from '@gpu-monitor/shared';
import type { FetchResult } from '@gpu-monitor/shared';

export type { FetchResult } from '@gpu-monitor/shared';

export interface AgentState {
  agents: IAgent[];
  gpus: Map<string, IGpu[]>;
  lastUpdate: Map<string, number>;
  lastFetchTimestamp: Map<string, number>;
  statusChangedAt: Map<string, number>;
  fetchResult: Map<string, FetchResult>;
}
