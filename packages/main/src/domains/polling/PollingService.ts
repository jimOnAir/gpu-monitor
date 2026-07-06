import { DEFAULT_SETTINGS, type IAgent, type IGpu, type ISettings } from '@gpu-monitor/shared';
import { EAgentStatus } from '@gpu-monitor/shared';

import { validateGpuResponse } from '../../gpu-validation';
import type { IHttpAdapter } from '../../infrastructure/electron/NodeHttpAdapter';
import type { Logger } from '../../logger';
import type { INotificationService } from '../notifications/INotificationService';
import type { ISettingsService } from '../settings/ISettingsService';
import type { ITrayService } from '../tray/ITrayService';
import type { IWindowService } from '../windows/IWindowService';

import type { AgentData, PollingHandlers } from './AgentData';
import type { IPollingService } from './IPollingService';

const STALE_CHECK_INTERVAL_MS = 5000;
const MIN_STALE_THRESHOLD_MS = 15000;

interface IGpuResponse { gpus: IGpu[]; timestamp?: number }
interface AgentFetchResult { gpus: IGpuResponse | null; healthOk: boolean }
type ClassifiedResult
  = | { status: 'ok', gpus: { gpus: IGpu[], timestamp?: number } }
  | { status: 'fetch-failed' }
  | { status: 'health-failed' };

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
    private readonly settingsService: ISettingsService,
    private readonly notificationService: INotificationService,
    private readonly trayService: ITrayService,
    private readonly windowService: IWindowService,
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
  }

  private async pollAgent(agent: IAgent): Promise<void> {
    const raw = await this.fetchAgentData(agent);
    if (!raw) {
      this.setAgentStatus(agent.id, EAgentStatus.Offline, 'Failed to fetch /gpu');

      return;
    }
    const classified = this.classifyResult(raw);
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

  private async fetchAgentData(agent: IAgent): Promise<AgentFetchResult | null> {
    const fetchUrl = `${agent.url}/gpu`;
    const healthUrl = `${agent.url}/health`;
    this.logger.info({ agent: agent.id, fetchUrl, healthUrl }, 'polling agent');

    const [gpuData, healthData] = await Promise.all([
      this.httpAdapter.getJson<IGpuResponse>(fetchUrl, 5000),
      this.httpAdapter.getJson<{ status: string }>(healthUrl, 5000),
    ]);

    const hasGpus = gpuData !== null && Array.isArray(gpuData.gpus);
    this.logger.info({ agent: agent.id, hasGpus }, 'poll result');
    const healthOk = healthData?.status === 'ok';

    return { gpus: hasGpus ? gpuData : null, healthOk };
  }

  private classifyResult(data: AgentFetchResult): ClassifiedResult {
    if (!data.gpus) {
      this.logger.warn('No GPU data returned from agent');

      return { status: 'fetch-failed' };
    }
    if (!data.healthOk) {
      this.logger.warn('Agent /health endpoint returned non-ok');

      return { status: 'health-failed' };
    }
    const validated = validateGpuResponse(data.gpus);
    if (!validated) {
      this.logger.warn('GPU data failed validation — rejecting response');

      return { status: 'fetch-failed' };
    }

    return { status: 'ok', gpus: validated };
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
    const now = Date.now();
    for (const agent of this.agentData.agents) {
      this.updateStaleStatus(agent, now);
    }
  }

  private updateStaleStatus(agent: IAgent, now: number): void {
    const lastUpdate = this.agentData.lastUpdate.get(agent.id) || 0;
    const age = now - lastUpdate;
    if (age > MIN_STALE_THRESHOLD_MS && agent.status === EAgentStatus.Online) {
      agent.status = EAgentStatus.Stale;
      this.agentData.statusChangedAt.set(agent.id, now);
    } else if (age <= MIN_STALE_THRESHOLD_MS && agent.status === EAgentStatus.Stale) {
      agent.status = EAgentStatus.Online;
      this.agentData.statusChangedAt.set(agent.id, now);
    }
  }
}
