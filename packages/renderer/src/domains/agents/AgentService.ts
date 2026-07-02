import { IAgent, IGpu, EAgentStatus, ISettings } from '@gpu-monitor/shared';
import { AgentRepository } from './AgentRepository';
import { logger } from './logger';

type StateListener = (state: AgentState) => void;

export type FetchResult = 'pending' | 'ok' | 'fetch-failed' | 'health-failed' | 'error';

export interface AgentState {
  agents: IAgent[];
  gpus: Map<string, IGpu[]>;
  lastUpdate: Map<string, number>;              // when last successful fetch completed (for stale detection)
  lastFetchTimestamp: Map<string, number>;      // exact timestamp of last fetch (for display)
  statusChangedAt: Map<string, number>;         // when status last changed (for footer "last updated")
  fetchResult: Map<string, FetchResult>;
}

export class AgentService {
  private agents: IAgent[] = [];
  private gpus: Map<string, IGpu[]> = new Map();
  private lastUpdate: Map<string, number> = new Map();
  private lastFetchTimestamp: Map<string, number> = new Map();
  private statusChangedAt: Map<string, number> = new Map();
  private fetchResult: Map<string, FetchResult> = new Map();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private fetchIntervalId: ReturnType<typeof setInterval> | null = null;
  private listeners: StateListener[] = [];
  private pollingAgents: Set<string> = new Set();
  private refreshIntervalMs: number = 5000;
  private repository: AgentRepository;

  constructor(repository?: AgentRepository) {
    this.repository = repository || new AgentRepository();
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.push(listener);
    listener(this.getState());
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  getState(): AgentState {
    return {
      agents: [...this.agents],
      gpus: new Map(this.gpus),
      lastUpdate: new Map(this.lastUpdate),
      lastFetchTimestamp: new Map(this.lastFetchTimestamp),
      statusChangedAt: new Map(this.statusChangedAt),
      fetchResult: new Map(this.fetchResult),
    };
  }

  initialize(settings: ISettings): void {
    logger.info('AgentService', undefined, `Initializing with ${settings.agents.length} agent(s), interval=${settings.refreshInterval}ms`);
    this.stopPolling();
    this.agents = [...settings.agents];
    // Mark all agents as Offline on init — they become Online only after a successful fetch
    this.agents.forEach((agent) => {
      agent.status = EAgentStatus.Offline;
      agent.lastError = 'Initializing';
    });
    this.statusChangedAt.clear();
    this.refreshIntervalMs = settings.refreshInterval;
    this.gpus.clear();
    this.lastUpdate.clear();
    this.fetchResult.clear();
    this.lastFetchTimestamp.clear();
    this.refreshAll();
    this.startPolling(settings.refreshInterval);
  }

  updateSettings(settings: ISettings): void {
    logger.info('AgentService', undefined, `Settings updated, interval=${settings.refreshInterval}ms`);
    this.agents = [...settings.agents];
    this.agents.forEach((agent) => {
      agent.status = EAgentStatus.Offline;
      agent.lastError = 'Settings updated';
    });
    this.statusChangedAt.clear();
    this.refreshIntervalMs = settings.refreshInterval;
    this.stopPolling();
    this.startPolling(settings.refreshInterval);
  }

  refreshAll(): void {
    logger.debug('AgentService', undefined, 'refreshAll() called');
    this.agents.forEach((agent) => this.pollAgent(agent));
  }

  private async pollAgent(agent: IAgent): Promise<void> {
    this.pollingAgents.add(agent.id);
    this.fetchResult.set(agent.id, 'pending');
    this.notify();

    logger.info('AgentService', agent.name, `Polling ${agent.url}`);

    try {
      const gpus = await this.repository.fetchGpus(agent.url);
      if (gpus === null) {
        logger.warn('AgentService', agent.name, 'fetchGpus returned null');
        this.fetchResult.set(agent.id, 'fetch-failed');
        this.setAgentStatus(agent.id, EAgentStatus.Offline, 'Failed to fetch data');
        this.notify();
        return;
      }

      logger.info('AgentService', agent.name, `fetchGpus OK: ${gpus.length} GPU(s)`, { gpuCount: gpus.length });

      const isHealthy = await this.repository.healthCheck(agent.url);
      if (!isHealthy) {
        logger.warn('AgentService', agent.name, 'healthCheck FAILED');
        this.fetchResult.set(agent.id, 'health-failed');
        this.setAgentStatus(agent.id, EAgentStatus.Offline, 'Health check failed');
        this.notify();
        return;
      }

      logger.info('AgentService', agent.name, 'healthCheck OK');

      // Success — update GPU data and fetch timestamp
      this.gpus.set(agent.id, gpus);
      const now = Date.now();
      this.lastUpdate.set(agent.id, now);
      this.lastFetchTimestamp.set(agent.id, now);
      this.fetchResult.set(agent.id, 'ok');
      
      // Only transition status if currently Stale or Offline
      const currentStatus = this.getAgentStatus(agent.id);
      if (currentStatus === EAgentStatus.Stale || currentStatus === EAgentStatus.Offline) {
        this.setAgentStatus(agent.id, EAgentStatus.Online, undefined);
        logger.info('AgentService', agent.name, 'Status OFFLINE/STALE → ONLINE');
      }
      this.notify();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('AgentService', agent.name, `Exception: ${message}`, { error: message });
      this.fetchResult.set(agent.id, 'error');
      this.setAgentStatus(agent.id, EAgentStatus.Offline, message);
      this.notify();
    } finally {
      this.pollingAgents.delete(agent.id);
      logger.debug('AgentService', agent.name, 'Poll finished');
    }
  }

  /** Start periodic polling.
   *
   * Two intervals:
   * 1. fetchIntervalId: calls refreshAll() every refreshIntervalMs to fetch fresh GPU data
   * 2. intervalId: calls checkStale() every STALE_CHECK_INTERVAL_MS to detect stale agents
   */
  private startPolling(intervalMs: number): void {
    this.refreshIntervalMs = intervalMs;

    this.fetchIntervalId = setInterval(() => {
      logger.debug('AgentService', undefined, 'Fetch interval tick, calling refreshAll()');
      this.refreshAll();
    }, intervalMs);

    this.intervalId = setInterval(() => {
      this.checkStale();
    }, STALE_CHECK_INTERVAL_MS);

    logger.info('AgentService', undefined, `Polling started: fetch every ${intervalMs}ms, stale check every ${STALE_CHECK_INTERVAL_MS}ms`);
  }

  stopPolling(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('AgentService', undefined, 'Stale check interval stopped');
    }
    if (this.fetchIntervalId !== null) {
      clearInterval(this.fetchIntervalId);
      this.fetchIntervalId = null;
      logger.info('AgentService', undefined, 'Fetch interval stopped');
    }
  }

  private checkStale(): void {
    const now = Date.now();
    const staleThreshold = Math.max(this.refreshIntervalMs * 3, MIN_STALE_THRESHOLD_MS);
    let changed = false;

    this.agents.forEach((agent) => {
      if (this.pollingAgents.has(agent.id)) return;

      const lastUpdate = this.lastUpdate.get(agent.id);
      if (!lastUpdate) {
        logger.debug('AgentService', agent.name, 'checkStale: no lastUpdate, skipping');
        return;
      }

      const age = now - lastUpdate;
      logger.debug('AgentService', agent.name, `checkStale: age=${age}ms, threshold=${staleThreshold}ms`);

      if (age > staleThreshold) {
        if (this.getAgentStatus(agent.id) !== EAgentStatus.Stale) {
          logger.warn('AgentService', agent.name, 'MARKING STALE');
          this.setAgentStatus(agent.id, EAgentStatus.Stale, 'Data stale');
          changed = true;
        }
      } else if (this.getAgentStatus(agent.id) === EAgentStatus.Stale) {
        logger.info('AgentService', agent.name, 'CLEARING STALE');
        this.setAgentStatus(agent.id, EAgentStatus.Online, undefined);
        changed = true;
      }
    });

    if (changed) {
      this.notify();
    }
  }

  private getAgentStatus(agentId: string): EAgentStatus {
    const agent = this.agents.find((a) => a.id === agentId);
    return agent?.status || EAgentStatus.Offline;
  }

  private setAgentStatus(agentId: string, status: EAgentStatus, error?: string): void {
    const agent = this.agents.find((a) => a.id === agentId);
    if (agent) {
      agent.status = status;
      agent.lastError = error;
      this.statusChangedAt.set(agentId, Date.now());
    }
  }

  private notify(): void {
    const state = this.getState();
    this.listeners.forEach((listener) => listener(state));
  }
}

const STALE_CHECK_INTERVAL_MS = 5000;
const MIN_STALE_THRESHOLD_MS = 15000;
