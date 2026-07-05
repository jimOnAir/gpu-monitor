import { describe, expect, it, vi, beforeEach } from 'vitest';

import { DEFAULT_SETTINGS, EAgentStatus } from '@gpu-monitor/shared';
import type { IAgent, IGpu, INotificationCooldowns } from '@gpu-monitor/shared';

import { AgentData, NotificationService } from './notification-service';

// Mock Electron — only Notification is needed; everything else is no-op stubs
const mockNotifications: Array<{ title: string; body: string; icon: string; silent: boolean }> = [];
vi.mock('electron', () => ({
  Notification: vi.fn().mockImplementation((props: Record<string, unknown>) => {
    mockNotifications.push(props as unknown as typeof mockNotifications[0]);
    return { show: vi.fn() };
  }),
  app: {
    getPath: vi.fn().mockReturnValue('/tmp'),
    getName: vi.fn(),
    setName: vi.fn(),
    isPackaged: false,
    requestSingleInstanceLock: vi.fn().mockReturnValue(true),
    whenReady: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    quit: vi.fn(),
  },
  BrowserWindow: vi.fn(),
  Tray: vi.fn(),
  Menu: {
    buildFromTemplate: vi.fn().mockReturnValue({}),
    setApplicationMenu: vi.fn(),
  },
  nativeImage: { createFromPath: vi.fn(), createEmpty: vi.fn() },
  ipcMain: {
    on: vi.fn(),
    handle: vi.fn(),
  },
}));

function buildAgent(id: string = 'test', status: EAgentStatus = EAgentStatus.Online): IAgent {
  return { id, name: id, url: 'http://localhost:9091', status };
}

function buildGpu(index: number = 0, overrides: Partial<IGpu> = {}): IGpu {
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

function buildData(agents: IAgent[] = [buildAgent()], gpus: Map<string, IGpu[]> = new Map()): AgentData {
  return {
    agents,
    gpus,
    lastUpdate: new Map(),
    lastFetchTimestamp: new Map(),
    statusChangedAt: new Map(),
    fetchResult: new Map(),
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
    service = new NotificationService();
    settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
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
