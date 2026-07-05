/**
 * Agent polling logic.
 * Handles fetching GPU data from remote agents, classification, and state management.
 */

import type { IAgent, IGpu } from '@gpu-monitor/shared';
import { EAgentStatus } from '@gpu-monitor/shared';
import * as http from 'http';

import { validateGpuResponse } from './gpu-validation';
import logger from './logger';
import type { AgentData, Settings } from './notification-service';

let pollingInterval: ReturnType<typeof setInterval> | null = null;
let staleCheckInterval: ReturnType<typeof setInterval> | null = null;
export const agentData: AgentData = {
  agents: [],
  gpus: new Map(),
  lastUpdate: new Map(),
  lastFetchTimestamp: new Map(),
  statusChangedAt: new Map(),
  fetchResult: new Map(),
};

const STALE_CHECK_INTERVAL_MS = 5000;
const MIN_STALE_THRESHOLD_MS = 15000;

interface IGpuResponse {
  gpus: IGpu[];
  timestamp?: number;
}

interface AgentFetchResult {
  gpus: IGpuResponse | null;
  healthOk: boolean;
}

type ClassifiedResult
  = | { status: 'ok', gpus: { gpus: IGpu[], timestamp?: number } }
  | { status: 'fetch-failed' }
  | { status: 'health-failed' };

/** Fetch JSON from an HTTP URL. Returns `null` on failure. Forces IPv4 to avoid ::1 connection issues. */
async function fetchJson<T = unknown>(url: string, timeoutMs = 5000): Promise<T | null> {
  return new Promise((resolve) => {
    logger.debug({ url }, 'fetchJson start');
    const req = http.get(url, { family: 4, timeout: timeoutMs }, (res) => {
      logger.debug({ url, statusCode: res.statusCode }, 'fetchJson response');
      let data = '';
      res.on('data', (chunk: Buffer) => {
        data += chunk.toString();
      });
      res.on('end', () => {
        logger.debug({ url, dataLen: data.length }, 'fetchJson end');
        try {
          resolve(JSON.parse(data) as T);
        } catch {
          logger.error({ url }, 'fetchJson parse error');
          resolve(null);
        }
      });
    });
    req.on('error', (e) => {
      logger.error({ url, error: e.message }, 'fetchJson error');
      resolve(null);
    });
    req.on('timeout', () => {
      logger.error({ url }, 'fetchJson timeout');
      req.destroy();
      resolve(null);
    });
  });
}

async function pollAgent(agent: IAgent): Promise<void> {
  const raw = await fetchAgentData(agent);
  if (!raw) {
    setAgentStatus(agent.id, EAgentStatus.Offline, 'Failed to fetch /gpu');

    return;
  }
  const classified = classifyResult(raw);
  agentData.fetchResult.set(agent.id, classified.status);
  agentData.lastFetchTimestamp.set(agent.id, Date.now());
  if (classified.status === 'ok') {
    agentData.gpus.set(agent.id, classified.gpus.gpus);
    const ts = classified.gpus.timestamp ? classified.gpus.timestamp * 1000 : Date.now();
    agentData.lastUpdate.set(agent.id, ts);
    agentData.statusChangedAt.set(agent.id, Date.now());
    setAgentStatus(agent.id, EAgentStatus.Online, undefined);
  } else {
    const error = classified.status === 'fetch-failed' ? 'Failed to fetch /gpu' : undefined;
    setAgentStatus(agent.id, EAgentStatus.Offline, error);
  }
}

async function fetchAgentData(agent: IAgent): Promise<AgentFetchResult | null> {
  const fetchUrl = `${agent.url}/gpu`;
  const healthUrl = `${agent.url}/health`;
  logger.info({ agent: agent.id, fetchUrl, healthUrl }, 'polling agent');

  return Promise.all([
    fetchJson<IGpuResponse>(fetchUrl),
    fetchJson<{ status: string }>(healthUrl),
  ]).then(([gpuData, healthData]) => {
    const hasGpus = gpuData !== null && Array.isArray(gpuData.gpus);
    logger.info({ agent: agent.id, hasGpus }, 'poll result');
    const healthOk = healthData?.status === 'ok';

    return { gpus: hasGpus ? gpuData : null, healthOk };
  });
}

function classifyResult(data: AgentFetchResult): ClassifiedResult {
  if (!data.gpus) {
    logger.warn('No GPU data returned from agent');

    return { status: 'fetch-failed' };
  }
  if (!data.healthOk) {
    logger.warn('Agent /health endpoint returned non-ok');

    return { status: 'health-failed' };
  }
  const validated = validateGpuResponse(data.gpus);
  if (!validated) {
    logger.warn('GPU data failed validation — rejecting response');

    return { status: 'fetch-failed' };
  }

  return { status: 'ok', gpus: validated };
}

function setAgentStatus(agentId: string, status: EAgentStatus, error?: string): void {
  const existing = agentData.agents.findIndex((a) => a.id === agentId);
  if (existing < 0) {
    return;
  }
  agentData.agents[existing] = {
    ...agentData.agents[existing],
    status,
    ...(error !== undefined ? { lastError: error } : {}),
  };
}

export async function refreshAllAgents(): Promise<void> {
  await Promise.allSettled(agentData.agents.map(async (a) => pollAgent(a)));
}

export function checkStale(_settings: Settings): void {
  const now = Date.now();
  for (const agent of agentData.agents) {
    updateStaleStatus(agent, now);
  }
}

function updateStaleStatus(agent: IAgent, now: number): void {
  const lastUpdate = agentData.lastUpdate.get(agent.id) || 0;
  const age = now - lastUpdate;
  if (age > MIN_STALE_THRESHOLD_MS && agent.status === EAgentStatus.Online) {
    agent.status = EAgentStatus.Stale;
    agentData.statusChangedAt.set(agent.id, now);
  } else if (age <= MIN_STALE_THRESHOLD_MS && agent.status === EAgentStatus.Stale) {
    agent.status = EAgentStatus.Online;
    agentData.statusChangedAt.set(agent.id, now);
  }
}

export interface PollingCallbacks {
  pushToRenderer: () => void;
  evaluateAndNotify: (agentData: AgentData, settings: Settings) => void;
  updateTrayFromData: () => void;
}

let callbacks: PollingCallbacks | null = null;

/** Set the callbacks for polling operations. */
export function setPollingCallbacks(cb: PollingCallbacks): void {
  callbacks = cb;
}

export function startPolling(settings: Settings): void {
  if (!callbacks) {
    throw new Error('Polling callbacks not initialized');
  }
  stopPolling();
  agentData.agents = settings.agents.map((a) => ({ ...a, status: EAgentStatus.Pending }));
  agentData.gpus = new Map();
  agentData.lastUpdate = new Map();
  agentData.lastFetchTimestamp = new Map();
  agentData.statusChangedAt = new Map();
  agentData.fetchResult = new Map();
  const cb = callbacks;
  cb.pushToRenderer();
  void refreshAllAgents().then(() => {
    checkStale(settings);
    cb.evaluateAndNotify(agentData, settings);
    cb.updateTrayFromData();
    cb.pushToRenderer();
  });
  pollingInterval = setInterval(() => {
    void refreshAllAgents().then(() => {
      checkStale(settings);
      cb.evaluateAndNotify(agentData, settings);
      cb.updateTrayFromData();
      cb.pushToRenderer();
    });
  }, settings.refreshInterval);
  staleCheckInterval = setInterval(() => {
    checkStale(settings);
    cb.pushToRenderer();
  }, STALE_CHECK_INTERVAL_MS);
}

function stopPolling(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  if (staleCheckInterval) {
    clearInterval(staleCheckInterval);
    staleCheckInterval = null;
  }
}
