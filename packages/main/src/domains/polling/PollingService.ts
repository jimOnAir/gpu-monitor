import { EAgentStatus, type IAgent, type ISettings } from '@gpu-monitor/shared';
import type { AgentData } from '@gpu-monitor/shared';

import type { Logger } from '../../logger';

import type { PollingHandlers } from './AgentData';
import type { AgentPoller } from './AgentPoller';
import type { IPollingService } from './IPollingService';
import type { MetricsHistoryService } from './MetricsHistoryService';
import type { StaleDetector } from './StaleDetector';
import { STALE_CHECK_INTERVAL_MS } from './StaleDetector';

const FETCH_ERROR_MESSAGES: Record<string, string> = {
  'fetch-failed': 'Failed to fetch /gpu',
  'health-failed': 'Agent /health not ok',
  invalid: 'GPU data failed validation',
};

/**
 * Orchestrates agent polling: owns the active settings and the poll cycle
 * (fetch → classify → stale → notify → tray → push).
 * All entry points (interval, stale check, manual refresh) run the same cycle.
 */
export class PollingService implements IPollingService {
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private staleCheckInterval: ReturnType<typeof setInterval> | null = null;
  private handlers: PollingHandlers | null = null;
  private activeSettings: ISettings | null = null;
  private agentData: AgentData = {
    agents: [],
    gpus: new Map(),
    lastUpdate: new Map(),
    lastFetchTimestamp: new Map(),
    statusChangedAt: new Map(),
    fetchResult: new Map(),
    prevAgentStatus: new Map(),
    averages: new Map(),
  };

  constructor(
    private readonly logger: Logger,
    private readonly agentPoller: AgentPoller,
    private readonly staleDetector: StaleDetector,
    private readonly metricsHistory: MetricsHistoryService,
    private readonly handlersProvider: () => PollingHandlers | null,
  ) {}

  getAgentData(): AgentData {
    return this.agentData;
  }

  registerHandlers(handlers: PollingHandlers): void {
    this.handlers = handlers;
  }

  startPolling(settings: ISettings): void {
    this.stopPolling();
    this.activeSettings = settings;

    this.agentData = {
      agents: settings.agents.map((a) => ({ ...a, status: EAgentStatus.Pending })),
      gpus: new Map(),
      lastUpdate: new Map(),
      lastFetchTimestamp: new Map(),
      statusChangedAt: new Map(),
      fetchResult: new Map(),
      prevAgentStatus: new Map(),
      averages: new Map(),
    };
    this.metricsHistory.reset();

    void this.runCycle();

    this.pollingInterval = setInterval(() => {
      void this.runCycle().catch((error: unknown) => {
        this.logger.error({ error: String(error) }, 'polling interval callback failed');
      });
    }, settings.refreshInterval);

    this.staleCheckInterval = setInterval(() => {
      try {
        this.runStaleCheck();
      } catch (error) {
        this.logger.error({ error: String(error) }, 'stale check callback failed');
      }
    }, STALE_CHECK_INTERVAL_MS);
  }

  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval); this.pollingInterval = null;
    }
    if (this.staleCheckInterval) {
      clearInterval(this.staleCheckInterval); this.staleCheckInterval = null;
    }
  }

  /**
   * Run one full poll cycle. Used by the poll interval, the stale-check
   * interval, and manual refresh (tray menu / settings save).
   */
  async refreshAgents(): Promise<void> {
    await this.runCycle();
  }

  private async runCycle(): Promise<void> {
    const handlers = this.handlers ?? this.handlersProvider();
    const settings = this.activeSettings;
    if (!handlers || !settings) {
      return;
    }

    await this.refreshAllAgents();
    this.checkStale();
    handlers.evaluateAndNotify(this.agentData, settings);
    handlers.updateTrayFromData();
    handlers.pushToRenderer();
    this.logger.info('polling cycle executed');
  }

  private async refreshAllAgents(): Promise<void> {
    // Snapshot current status before polling so transitions can be detected
    for (const agent of this.agentData.agents) {
      this.agentData.prevAgentStatus.set(agent.id, agent.status ?? EAgentStatus.Pending);
    }
    await Promise.allSettled(this.agentData.agents.map(async (a) => this.pollAgent(a)));

    // Log the result of the polling cycle
    const gpuCount = Array.from(this.agentData.gpus.values()).reduce((sum, gpus) => sum + gpus.length, 0);
    this.logger.info({
      gpuCount,
      agents: this.agentData.agents.map((a) => ({ id: a.id, status: a.status })),
      fetchResults: Array.from(this.agentData.fetchResult.entries()),
    }, 'polling cycle completed');
  }

  private async pollAgent(agent: IAgent): Promise<void> {
    const raw = await this.agentPoller.fetchAgentData(agent);
    const classified = this.agentPoller.classifyResult(raw);
    this.agentData.fetchResult.set(agent.id, classified.status);
    this.agentData.lastFetchTimestamp.set(agent.id, Date.now());
    if (classified.status === 'ok') {
      this.agentData.gpus.set(agent.id, classified.gpus.gpus);
      const ts = classified.gpus.timestamp ? classified.gpus.timestamp * 1000 : Date.now();
      this.agentData.lastUpdate.set(agent.id, ts);
      this.agentData.statusChangedAt.set(agent.id, Date.now());
      this.metricsHistory.record(agent.id, classified.gpus.gpus, ts);
      this.agentData.averages.set(agent.id, this.metricsHistory.getAverages(agent.id, classified.gpus.gpus));
      this.setAgentStatus(agent.id, EAgentStatus.Online, undefined);
    } else {
      this.setAgentStatus(agent.id, EAgentStatus.Offline, FETCH_ERROR_MESSAGES[classified.status]);
    }
  }

  private setAgentStatus(agentId: string, status: EAgentStatus, error: string | undefined): void {
    const existing = this.agentData.agents.findIndex((a) => a.id === agentId);
    if (existing < 0) {
      return;
    }
    this.agentData.agents[existing] = {
      ...this.agentData.agents[existing],
      status,
      ...(error !== undefined ? { lastError: error } : {}),
    };
  }

  private checkStale(): void {
    this.staleDetector.checkStale(this.agentData.agents, this.agentData.lastUpdate);
  }

  private runStaleCheck(): void {
    const handlers = this.handlers ?? this.handlersProvider();
    const settings = this.activeSettings;
    if (!handlers || !settings) {
      return;
    }

    this.checkStale();
    handlers.evaluateAndNotify(this.agentData, settings);
    handlers.updateTrayFromData();
    handlers.pushToRenderer();
  }
}
