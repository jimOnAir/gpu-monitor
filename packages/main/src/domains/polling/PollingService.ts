import { DEFAULT_SETTINGS, EAgentStatus, type IAgent, type ISettings } from '@gpu-monitor/shared';
import type { AgentData } from '@gpu-monitor/shared';

import type { Logger } from '../../logger';
import type { INotificationService } from '../notifications/INotificationService';
import type { ISettingsRepository } from '../settings/ISettingsService';
import type { ITrayService } from '../tray/ITrayService';
import type { IWindowService } from '../windows/IWindowService';

import type { PollingHandlers } from './AgentData';
import type { AgentPoller } from './AgentPoller';
import type { IHttpAdapter } from './IHttpAdapter';
import type { IPollingService } from './IPollingService';
import type { StaleDetector } from './StaleDetector';
import { STALE_CHECK_INTERVAL_MS } from './StaleDetector';

/**
 * Orchestrates agent polling: manages HTTP fetch lifecycle, stale detection intervals,
 * and delegates data classification to AgentPoller and stale checks to StaleDetector.
 */
export class PollingService implements IPollingService {
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private staleCheckInterval: ReturnType<typeof setInterval> | null = null;
  private handlers: PollingHandlers | null = null;
  private currentSettings: ISettings = DEFAULT_SETTINGS;
  private agentData: AgentData = {
    agents: [],
    gpus: new Map(),
    lastUpdate: new Map(),
    lastFetchTimestamp: new Map(),
    statusChangedAt: new Map(),
    fetchResult: new Map(),
    prevAgentStatus: new Map(),
  };

  constructor(
    private readonly logger: Logger,
    private readonly httpAdapter: IHttpAdapter,
    private readonly settingsRepository: ISettingsRepository,
    private readonly notificationService: INotificationService,
    private readonly trayService: ITrayService,
    private readonly windowService: IWindowService,
    private readonly agentPoller: AgentPoller,
    private readonly staleDetector: StaleDetector,
  ) {}

  getAgentData(): AgentData {
    return this.agentData;
  }

  registerHandlers(handlers: PollingHandlers): void {
    this.handlers = handlers;
  }

  startPolling(settings: ISettings): void {
    if (!this.handlers) {
      throw new Error('Polling handlers not initialized');
    }
    this.stopPolling();
    this.currentSettings = settings;

    this.agentData = {
      agents: settings.agents.map((a) => ({ ...a, status: EAgentStatus.Pending })),
      gpus: new Map(),
      lastUpdate: new Map(),
      lastFetchTimestamp: new Map(),
      statusChangedAt: new Map(),
      fetchResult: new Map(),
      prevAgentStatus: new Map(),
    };

    const cb = this.handlers;
    cb.pushToRenderer();
    void this.refreshAllAgents().then(() => {
      this.checkStale();
      cb.evaluateAndNotify(this.agentData, settings);
      cb.updateTrayFromData();
      cb.pushToRenderer();
    });

    this.pollingInterval = setInterval(() => {
      void this.refreshAllAgents().then(() => {
        this.checkStale();
        cb.evaluateAndNotify(this.agentData, settings);
        cb.updateTrayFromData();
        cb.pushToRenderer();
        this.logger.info('polling interval callback executed');
      }).catch((error: unknown) => {
        this.logger.error({ error: String(error) }, 'polling interval callback failed');
      });
    }, settings.refreshInterval);

    this.staleCheckInterval = setInterval(() => {
      this.checkStale();
      cb.pushToRenderer();
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

  async refreshAllAgents(): Promise<void> {
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
      this.setAgentStatus(agent.id, EAgentStatus.Online, undefined);
    } else {
      const error = classified.status === 'fetch-failed' ? 'Failed to fetch /gpu' : undefined;
      this.setAgentStatus(agent.id, EAgentStatus.Offline, error);
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
}
