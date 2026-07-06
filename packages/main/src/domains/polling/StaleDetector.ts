import { EAgentStatus } from '@gpu-monitor/shared';
import type { IAgent } from '@gpu-monitor/shared';

export const STALE_CHECK_INTERVAL_MS = 5000;
export const MIN_STALE_THRESHOLD_MS = 15000;

/**
 * Detects stale agent connections based on time since last update.
 * Pure detection logic — no state management, no polling.
 */
export class StaleDetector {
  /**
   * Update an agent's status to Stale if it hasn't reported within the threshold.
   * Returns true if the status was changed.
   */
  updateStaleStatus(agent: IAgent, now: number, lastUpdate: number): { agent: IAgent; changed: boolean } {
    const age = now - lastUpdate;
    if (age > MIN_STALE_THRESHOLD_MS && agent.status === EAgentStatus.Online) {
      agent.status = EAgentStatus.Stale;
      return { agent, changed: true };
    }
    if (age <= MIN_STALE_THRESHOLD_MS && agent.status === EAgentStatus.Stale) {
      agent.status = EAgentStatus.Online;
      return { agent, changed: true };
    }

    return { agent, changed: false };
  }

  /**
   * Check all agents for staleness.
   */
  checkStale(agents: IAgent[], lastUpdate: Map<string, number>): void {
    const now = Date.now();
    for (const agent of agents) {
      const lastTs = lastUpdate.get(agent.id) || 0;
      this.updateStaleStatus(agent, now, lastTs);
    }
  }
}
