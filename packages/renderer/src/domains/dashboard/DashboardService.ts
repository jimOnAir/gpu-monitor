import type { IGpu } from '@gpu-monitor/shared';
import { EAgentStatus } from '@gpu-monitor/shared';

import type { AgentState } from '../../types/AgentState';

/**
 * DashboardService: aggregates data from multiple agents for display.
 * Groups GPUs by agent, identifies unreachable agents, computes counts and timestamps.
 */
export class DashboardService {
  /**
   * Group GPUs by agent for the dashboard layout.
   */
  getGpusByAgent(state: AgentState): Map<string, Array<{ gpu: IGpu, agentName: string }>> {
    const grouped = new Map<string, Array<{ gpu: IGpu, agentName: string }>>();

    state.agents.forEach((agent) => {
      if (agent.status !== EAgentStatus.Online) {
        return;
      }
      const gpus = state.gpus.get(agent.id);
      if (gpus && gpus.length > 0) {
        grouped.set(agent.id, gpus.map((gpu) => ({ gpu, agentName: agent.name })));
      }
    });

    return grouped;
  }

  /**
   * Get agents that are not Online (Offline or Stale).
   * Used to show unreachable agents in the GPU list.
   */
  getUnreachableAgents(state: AgentState): Array<{
    agent: import('@gpu-monitor/shared').IAgent,
  }> {
    return state.agents
      .filter((agent) => agent.status !== EAgentStatus.Online)
      .map((agent) => ({ agent }));
  }

  /**
   * Get total GPU count across all agents.
   */
  getGpuCount(state: AgentState): number {
    let count = 0;
    state.gpus.forEach((gpus) => {
      count += gpus.length;
    });

    return count;
  }

  /**
   * Get the most recent update time across all agents.
   */
  getLastUpdateTime(state: AgentState): number {
    let latest = 0;
    state.lastUpdate.forEach((ts) => {
      if (ts > latest) {
        latest = ts;
      }
    });

    return latest;
  }
}
