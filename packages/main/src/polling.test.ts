import { EAgentStatus } from '@gpu-monitor/shared';
import type { IAgent, ISettings } from '@gpu-monitor/shared';
import type { Logger } from 'pino';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { AgentPoller } from './domains/polling/AgentPoller';
import type { IHttpAdapter } from './domains/polling/IHttpAdapter';
import { PollingService } from './domains/polling/PollingService';
import { StaleDetector } from './domains/polling/StaleDetector';

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  setEnvironment: vi.fn(),
  setLevel: vi.fn(),
  child: vi.fn().mockReturnThis(),
  trace: vi.fn(),
  fatal: vi.fn(),
} as unknown as Logger;

const VALID_GPU_RESPONSE = {
  gpus: [
    {
      index: 0,
      name: 'Test GPU',
      uuid: 'GPU-000',
      coreTemp: 60,
      junctionTemp: 65,
      vramTemp: 55,
      gpuUtilization: 30,
      memoryUsed: 2e9,
      memoryTotal: 16e9,
      powerUsage: 100,
    },
  ],
  // Fresh timestamp — a stale-looking one would trip the 15s stale threshold
  timestamp: Math.floor(Date.now() / 1000),
};

function buildAgent(id = 'test'): IAgent {
  return { id, name: id, url: `http://${id}:9091` };
}

function buildSettings(agents: IAgent[] = [buildAgent()]): ISettings {
  return {
    agents,
    // Long enough that the poll interval never fires during tests
    refreshInterval: 3600000,
    thresholds: {
      core: { warn: 70, critical: 85 },
      junction: { warn: 80, critical: 95 },
      vram: { warn: 80, critical: 95 },
    },
    notifications: {
      enabled: true,
      cooldowns: {
        tempCritical: 60000,
        tempWarn: 120000,
        tempRecover: 60000,
        agentOffline: 30000,
        agentOnline: 30000,
        allRecovered: 300000,
      },
    },
  };
}

function mockHttp(impl: (url: string) => unknown): IHttpAdapter {
  return { getJson: impl as never };
}

describe('AgentPoller.classifyResult', () => {
  const poller = new AgentPoller(mockLogger, mockHttp(() => null));

  it('returns ok for valid data', () => {
    const result = poller.classifyResult({ gpus: VALID_GPU_RESPONSE, healthOk: true });
    expect(result.status).toBe('ok');
  });

  it('returns fetch-failed for null data', () => {
    const result = poller.classifyResult(null);
    expect(result.status).toBe('fetch-failed');
  });

  it('returns fetch-failed when gpus is null', () => {
    const result = poller.classifyResult({ gpus: null, healthOk: true });
    expect(result.status).toBe('fetch-failed');
  });

  it('returns health-failed when health is not ok', () => {
    const result = poller.classifyResult({ gpus: VALID_GPU_RESPONSE, healthOk: false });
    expect(result.status).toBe('health-failed');
  });

  it('returns invalid when GPU data fails validation', () => {
    const result = poller.classifyResult({ gpus: { gpus: [] }, healthOk: true });
    expect(result.status).toBe('invalid');
  });
});

describe('PollingService', () => {
  let getJson: ReturnType<typeof vi.fn>;
  let poller: AgentPoller;
  let service: PollingService;
  let handlers: {
    evaluateAndNotify: ReturnType<typeof vi.fn>,
    updateTrayFromData: ReturnType<typeof vi.fn>,
    pushToRenderer: ReturnType<typeof vi.fn>,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    getJson = vi.fn();
    const httpAdapter: IHttpAdapter = { getJson: getJson as never };
    poller = new AgentPoller(mockLogger, httpAdapter);
    handlers = {
      evaluateAndNotify: vi.fn(),
      updateTrayFromData: vi.fn(),
      pushToRenderer: vi.fn(),
    };
    service = new PollingService(mockLogger, poller, new StaleDetector(), () => null);
    service.registerHandlers(handlers);
  });

  afterEach(() => {
    service.stopPolling();
    vi.useRealTimers();
  });

  it('runs the full cycle: fetch → stale → notify → tray → push', async () => {
    getJson.mockImplementation(async (url: string) => {
      if (url.endsWith('/gpu')) {
        return Promise.resolve(VALID_GPU_RESPONSE);
      }

      return Promise.resolve({ status: 'ok' });
    });

    service.startPolling(buildSettings());
    // Advance less than the stale-check interval (5s) so only the initial cycle runs
    await vi.advanceTimersByTimeAsync(1000);

    expect(handlers.evaluateAndNotify).toHaveBeenCalled();
    expect(handlers.updateTrayFromData).toHaveBeenCalled();
    expect(handlers.pushToRenderer).toHaveBeenCalled();

    const data = service.getAgentData();
    expect(data.agents[0].status).toBe(EAgentStatus.Online);
    expect(data.gpus.get('test')).toHaveLength(1);
  });

  it('marks agent offline with fetch-failed error message', async () => {
    getJson.mockResolvedValue(null);

    service.startPolling(buildSettings());
    await vi.advanceTimersByTimeAsync(100);

    const data = service.getAgentData();
    expect(data.agents[0].status).toBe(EAgentStatus.Offline);
    expect(data.agents[0].lastError).toBe('Failed to fetch /gpu');
  });

  it('marks agent offline with health-failed error message', async () => {
    getJson.mockImplementation(async (url: string) => {
      if (url.endsWith('/gpu')) {
        return Promise.resolve(VALID_GPU_RESPONSE);
      }

      return Promise.resolve({ status: 'degraded' });
    });

    service.startPolling(buildSettings());
    await vi.advanceTimersByTimeAsync(100);

    const data = service.getAgentData();
    expect(data.agents[0].status).toBe(EAgentStatus.Offline);
    expect(data.agents[0].lastError).toBe('Agent /health not ok');
  });

  it('marks agent offline with invalid error message for bad GPU data', async () => {
    getJson.mockImplementation(async (url: string) => {
      if (url.endsWith('/gpu')) {
        return Promise.resolve({ gpus: [] });
      }

      return Promise.resolve({ status: 'ok' });
    });

    service.startPolling(buildSettings());
    await vi.advanceTimersByTimeAsync(100);

    const data = service.getAgentData();
    expect(data.agents[0].status).toBe(EAgentStatus.Offline);
    expect(data.agents[0].lastError).toBe('GPU data failed validation');
  });

  it('refreshAgents runs a cycle on demand', async () => {
    getJson.mockImplementation(async (url: string) => {
      if (url.endsWith('/gpu')) {
        return Promise.resolve(VALID_GPU_RESPONSE);
      }

      return Promise.resolve({ status: 'ok' });
    });

    service.startPolling(buildSettings());
    // Let the initial cycle run
    await vi.advanceTimersByTimeAsync(100);
    handlers.pushToRenderer.mockClear();

    await service.refreshAgents();

    expect(handlers.pushToRenderer).toHaveBeenCalled();
    expect(handlers.evaluateAndNotify).toHaveBeenCalled();
  });

  it('stale-check interval runs the full cycle (including stale detection)', async () => {
    getJson.mockImplementation(async (url: string) => {
      if (url.endsWith('/gpu')) {
        return Promise.resolve(VALID_GPU_RESPONSE);
      }

      return Promise.resolve({ status: 'ok' });
    });

    service.startPolling(buildSettings());
    await vi.advanceTimersByTimeAsync(100);

    // Simulate time passing beyond the stale threshold (15s)
    await vi.advanceTimersByTimeAsync(20000);

    const data = service.getAgentData();
    expect(data.agents[0].status).toBe(EAgentStatus.Stale);
  });
});
