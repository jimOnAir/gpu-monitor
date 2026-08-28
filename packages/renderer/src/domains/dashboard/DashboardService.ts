import { EAgentStatus, type IAgent, type IGpu } from '@gpu-monitor/shared';

import type { AgentState } from '../../types/AgentState';

/**
 * Dashboard aggregation: groups GPUs by agent, identifies unreachable agents,
 * computes counts and timestamps.
 */

/**
 * An agent is reachable when its status is Online.
 */
export function isReachable(agent: IAgent): boolean {
  return agent.status === EAgentStatus.Online;
}

/**
 * Group GPUs by agent for the dashboard layout.
 */
export function getGpusByAgent(state: AgentState): Map<string, Array<{ gpu: IGpu, agentName: string }>> {
  const grouped = new Map<string, Array<{ gpu: IGpu, agentName: string }>>();

  state.agents.forEach((agent) => {
    if (!isReachable(agent)) {
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
export function getUnreachableAgents(state: AgentState): Array<{
  agent: IAgent,
}> {
  return state.agents
    .filter((agent) => !isReachable(agent))
    .map((agent) => ({ agent }));
}

/**
 * Get the most recent update time across all agents.
 */
export function getLastUpdateTime(state: AgentState): number {
  let latest = 0;
  state.lastUpdate.forEach((ts) => {
    if (ts > latest) {
      latest = ts;
    }
  });

  return latest;
}

/**
 * Get the first non-undefined driver version across all agents.
 * All GPUs on one machine share the same driver.
 */
export function getDriverVersion(state: AgentState): string | undefined {
  for (const gpus of state.gpus.values()) {
    if (gpus.length > 0 && gpus[0].driverVersion) {
      return gpus[0].driverVersion;
    }
  }

  return undefined;
}
