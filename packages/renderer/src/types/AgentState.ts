/**
 * Agent state type shared between App.tsx (rebuilder) and DashboardService (consumer).
 * Extracted to avoid circular imports.
 */

import type { IAgent, IGpu } from '@gpu-monitor/shared';

export type FetchResult = 'pending' | 'ok' | 'fetch-failed' | 'health-failed' | 'error';

export interface AgentState {
  agents: IAgent[];
  gpus: Map<string, IGpu[]>;
  lastUpdate: Map<string, number>;
  lastFetchTimestamp: Map<string, number>;
  statusChangedAt: Map<string, number>;
  fetchResult: Map<string, FetchResult>;
}
