import { IGpu } from '@gpu-monitor/shared';
import { AgentState } from '../agents/AgentService';

/**
 * DashboardService: aggregates data from multiple agents for display.
 * Computes max values, identifies critical GPUs, prepares data for UI.
 */
export class DashboardService {
  /**
   * Flatten all GPUs from all agents into a single array with agent info.
   */
  getFlattenedGpus(state: AgentState): Array<{
    agentId: string;
    agentName: string;
    gpu: IGpu;
  }> {
    const result: Array<{ agentId: string; agentName: string; gpu: IGpu }> = [];

    state.agents.forEach((agent) => {
      const gpus = state.gpus.get(agent.id);
      if (gpus && gpus.length > 0) {
        gpus.forEach((gpu) => {
          result.push({
            agentId: agent.id,
            agentName: agent.name,
            gpu,
          });
        });
      }
    });

    return result;
  }

  /**
   * Group GPUs by agent for the dashboard layout.
   */
  getGpusByAgent(state: AgentState): Map<string, Array<{ gpu: IGpu; agentName: string }>> {
    const grouped = new Map<string, Array<{ gpu: IGpu; agentName: string }>>();

    state.agents.forEach((agent) => {
      const gpus = state.gpus.get(agent.id);
      if (gpus && gpus.length > 0) {
        grouped.set(agent.id, gpus.map((gpu) => ({ gpu, agentName: agent.name })));
      }
    });

    return grouped;
  }

  /**
   * Find the most critical GPU across all agents (highest temp relative to threshold).
   */
  getMostCriticalGpu(
    state: AgentState,
    thresholds: { core: { warn: number; critical: number }; junction: { warn: number; critical: number }; vram: { warn: number; critical: number } }
  ): { agentId: string; gpu: IGpu; tempType: 'core' | 'junction' | 'vram' } | null {
    let maxCriticality = -1;
    let result: { agentId: string; gpu: IGpu; tempType: 'core' | 'junction' | 'vram' } | null = null;

    state.agents.forEach((agent) => {
      const gpus = state.gpus.get(agent.id);
      if (!gpus) return;

      gpus.forEach((gpu) => {
        const temps = [
          { type: 'core' as const, value: gpu.coreTemp },
          { type: 'junction' as const, value: gpu.junctionTemp },
          { type: 'vram' as const, value: gpu.vramTemp },
        ];

        temps.forEach(({ type, value }) => {
          const threshold = thresholds[type];
          const criticality = value / threshold.critical;
          if (criticality > maxCriticality) {
            maxCriticality = criticality;
            result = { agentId: agent.id, gpu, tempType: type };
          }
        });
      });
    });

    return result;
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
      if (ts > latest) latest = ts;
    });
    return latest;
  }
}
