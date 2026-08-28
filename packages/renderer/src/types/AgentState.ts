/**
 * Renderer-side view of the shared AgentData.
 * Derived from AgentData — prevAgentStatus is main-process-only state.
 */
import type { AgentData } from '@gpu-monitor/shared';

export type { FetchResult } from '@gpu-monitor/shared';

export type AgentState = Omit<AgentData, 'prevAgentStatus'>;
