import { DEFAULT_SETTINGS, EAgentStatus } from '@gpu-monitor/shared';
import type { IAgent, IGpu, INotificationCooldowns } from '@gpu-monitor/shared';
import type { Logger } from 'pino';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { NotificationService } from './domains/notifications/NotificationService';
import type { AgentData } from './domains/polling/AgentData';

// Mock the notification dispatcher — the service depends on an interface, not electron directly
const mockNotifications: Array<{ title: string, body: string, icon: string, silent: boolean }> = [];
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

const mockDispatcher = {
  show: (props: { title: string, body: string, icon?: string, silent: boolean }) => {
    mockNotifications.push({
      title: props.title,
      body: props.body,
      icon: props.icon ?? '',
      silent: props.silent,
    });
  },
};

function buildAgent(id = 'test', status: EAgentStatus = EAgentStatus.Online): IAgent {
  return { id, name: id, url: 'http://localhost:9091', status };
}

function buildGpu(index = 0, overrides: Partial<IGpu> = {}): IGpu {
  return {
    index,
    name: 'Test GPU',
    uuid: 'GPU-000',
    coreTemp: 60,
    junctionTemp: 65,
    vramTemp: 55,
    gpuUtilization: 30,
    memoryUsed: 2e9,
    memoryTotal: 16e9,
    powerUsage: 100,
    coreStatus: 'normal',
    junctionStatus: 'normal',
    vramStatus: 'normal',
    ...overrides,
  };
}

function buildData(agents: IAgent[] = [buildAgent()], gpus = new Map<string, IGpu[]>()): AgentData {
  return {
    agents,
    gpus,
    lastUpdate: new Map(),
    lastFetchTimestamp: new Map(),
    statusChangedAt: new Map(),
    fetchResult: new Map(),
    prevAgentStatus: new Map(),
  };
}

function resetMock(): void {
  mockNotifications.length = 0;
  vi.clearAllMocks();
}

describe('NotificationService', () => {
  let service: NotificationService;
  let settings: typeof DEFAULT_SETTINGS;

  beforeEach(() => {
    resetMock();
    service = new NotificationService(mockLogger, mockDispatcher);
    settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as typeof DEFAULT_SETTINGS;
  });

  it('does nothing when notifications are disabled', () => {
    settings.notifications.enabled = false;
    const data = buildData();
    data.gpus.set('test', [buildGpu()]);

    service.evaluateAndNotify(data, settings);
    expect(mockNotifications).toHaveLength(0);
  });

  it('fires critical notification when temp exceeds critical threshold', () => {
    const data = buildData();
    data.gpus.set('test', [
      buildGpu(0, { coreTemp: 90, coreStatus: 'danger' }),
    ]);

    service.evaluateAndNotify(data, settings);
    expect(mockNotifications.length).toBeGreaterThan(0);
    const critical = mockNotifications.find((n) => n.title.includes('Critical'));
    expect(critical).toBeDefined();
  });

  it('fires warning notification when temp exceeds warn threshold', () => {
    const data = buildData();
    data.gpus.set('test', [
      buildGpu(0, { coreTemp: 75, coreStatus: 'warning' }),
    ]);

    service.evaluateAndNotify(data, settings);
    const warn = mockNotifications.find((n) => n.title.includes('Warning'));
    expect(warn).toBeDefined();
  });

  it('does not fire notification when all temps are normal', () => {
    const data = buildData();
    data.gpus.set('test', [buildGpu()]);

    service.evaluateAndNotify(data, settings);
    expect(mockNotifications).toHaveLength(0);
  });

  it('respects cooldowns — does not re-fire within cooldown period', () => {
    const cooldowns: INotificationCooldowns = {
      tempCritical: 60000,
      tempWarn: 120000,
      tempRecover: 60000,
      agentOffline: 30000,
      agentOnline: 30000,
      allRecovered: 300000,
    };
    settings.notifications.cooldowns = cooldowns;

    const data = buildData();
    data.gpus.set('test', [buildGpu(0, { coreTemp: 90, coreStatus: 'danger' })]);

    // First call fires
    service.evaluateAndNotify(data, settings);
    const firstCount = mockNotifications.filter((n) => n.title.includes('Critical')).length;

    // Second call with same data — should be suppressed by cooldown
    service.evaluateAndNotify(data, settings);
    const secondCount = mockNotifications.filter((n) => n.title.includes('Critical')).length;

    expect(firstCount).toBeGreaterThan(0);
    expect(secondCount).toBe(firstCount);
  });

  it('includes metric name in notification title', () => {
    const data = buildData();
    data.gpus.set('test', [
      buildGpu(0, { junctionTemp: 97, junctionStatus: 'danger' }),
    ]);

    service.evaluateAndNotify(data, settings);
    const junctionNotif = mockNotifications.find((n) => n.title.includes('Junction'));
    expect(junctionNotif).toBeDefined();
  });

  it('includes agent name in notification', () => {
    const agent = buildAgent('my-server', EAgentStatus.Online);
    const data = buildData([agent]);
    data.gpus.set('my-server', [buildGpu(0, { coreTemp: 90, coreStatus: 'danger' })]);

    service.evaluateAndNotify(data, settings);
    const found = mockNotifications.some((n) => n.title.includes('my-server'));
    expect(found).toBe(true);
  });

  it('handles multiple GPUs on one agent', () => {
    const data = buildData();
    data.gpus.set('test', [
      buildGpu(0, { coreTemp: 90, coreStatus: 'danger' }),
      buildGpu(1, { coreTemp: 92, coreStatus: 'danger' }),
    ]);

    service.evaluateAndNotify(data, settings);
    // Should fire at least one critical notification
    const critical = mockNotifications.filter((n) => n.title.includes('Critical'));
    expect(critical.length).toBeGreaterThan(0);
  });

  it('handles multiple agents', () => {
    const agent1 = buildAgent('server-1');
    const agent2 = buildAgent('server-2');
    const data = buildData([agent1, agent2]);
    data.gpus.set('server-1', [buildGpu(0, { coreTemp: 90, coreStatus: 'danger' })]);
    data.gpus.set('server-2', [buildGpu(0, { coreTemp: 91, coreStatus: 'danger' })]);

    service.evaluateAndNotify(data, settings);
    const server1Notif = mockNotifications.find((n) => n.title.includes('server-1'));
    const server2Notif = mockNotifications.find((n) => n.title.includes('server-2'));
    expect(server1Notif).toBeDefined();
    expect(server2Notif).toBeDefined();
  });

  it('uses correct notification icon for critical', () => {
    const data = buildData();
    data.gpus.set('test', [buildGpu(0, { coreTemp: 90, coreStatus: 'danger' })]);

    service.evaluateAndNotify(data, settings);
    const critical = mockNotifications.find((n) => n.title.includes('Critical'));
    expect(critical?.icon).toContain('critical');
  });
});
