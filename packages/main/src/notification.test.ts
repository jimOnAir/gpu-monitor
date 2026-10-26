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
    ...overrides,
  };
}

function buildData(
  agents: IAgent[] = [buildAgent()],
  gpus = new Map<string, IGpu[]>(),
  prevAgentStatus = new Map<string, EAgentStatus>(),
): AgentData {
  return {
    agents,
    gpus,
    lastUpdate: new Map(),
    lastFetchTimestamp: new Map(),
    statusChangedAt: new Map(),
    fetchResult: new Map(),
    prevAgentStatus,
    averages: new Map(),
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
    data.gpus.set('test', [buildGpu(0, { coreTemp: 90 })]);

    service.evaluateAndNotify(data, settings);
    expect(mockNotifications.length).toBeGreaterThan(0);
    const critical = mockNotifications.find((n) => n.title.includes('Critical'));
    expect(critical).toBeDefined();
  });

  it('fires warning notification when temp exceeds warn threshold', () => {
    const data = buildData();
    data.gpus.set('test', [buildGpu(0, { coreTemp: 75 })]);

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
    data.gpus.set('test', [buildGpu(0, { coreTemp: 90 })]);

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
    data.gpus.set('test', [buildGpu(0, { junctionTemp: 97 })]);

    service.evaluateAndNotify(data, settings);
    const junctionNotif = mockNotifications.find((n) => n.title.includes('Junction'));
    expect(junctionNotif).toBeDefined();
  });

  it('includes agent name in notification', () => {
    const agent = buildAgent('my-server', EAgentStatus.Online);
    const data = buildData([agent]);
    data.gpus.set('my-server', [buildGpu(0, { coreTemp: 90 })]);

    service.evaluateAndNotify(data, settings);
    const found = mockNotifications.some((n) => n.title.includes('my-server'));
    expect(found).toBe(true);
  });

  it('handles multiple GPUs on one agent', () => {
    const data = buildData();
    data.gpus.set('test', [
      buildGpu(0, { coreTemp: 90 }),
      buildGpu(1, { coreTemp: 92 }),
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
    data.gpus.set('server-1', [buildGpu(0, { coreTemp: 90 })]);
    data.gpus.set('server-2', [buildGpu(0, { coreTemp: 91 })]);

    service.evaluateAndNotify(data, settings);
    const server1Notif = mockNotifications.find((n) => n.title.includes('server-1'));
    const server2Notif = mockNotifications.find((n) => n.title.includes('server-2'));
    expect(server1Notif).toBeDefined();
    expect(server2Notif).toBeDefined();
  });

  it('uses correct notification icon for critical', () => {
    const data = buildData();
    data.gpus.set('test', [buildGpu(0, { coreTemp: 90 })]);

    service.evaluateAndNotify(data, settings);
    const critical = mockNotifications.find((n) => n.title.includes('Critical'));
    expect(critical?.icon).toContain('critical');
  });

  describe('recovery (per-metric state)', () => {
    it('fires recovery when a metric drops back below warn after warning', () => {
      const data = buildData();
      data.gpus.set('test', [buildGpu(0, { coreTemp: 75 })]);
      service.evaluateAndNotify(data, settings);
      expect(mockNotifications.some((n) => n.title.includes('Warning'))).toBe(true);

      resetMock();
      data.gpus.set('test', [buildGpu(0, { coreTemp: 60 })]);
      service.evaluateAndNotify(data, settings);
      const recovery = mockNotifications.find((n) => n.title.includes('Recovered') && n.title.includes('Core'));
      expect(recovery).toBeDefined();
    });

    it('does not fire recovery for a metric that never warned', () => {
      // Core is normal, junction warns (85 >= junction warn 80)
      const data = buildData();
      data.gpus.set('test', [buildGpu(0, { coreTemp: 60, junctionTemp: 85 })]);
      service.evaluateAndNotify(data, settings);

      resetMock();
      // Junction recovers (70 < 80); core was always normal — only one recovery
      data.gpus.set('test', [buildGpu(0, { coreTemp: 60, junctionTemp: 70 })]);
      service.evaluateAndNotify(data, settings);
      const metricRecoveries = mockNotifications.filter((n) => n.title.includes('Temperature Recovered'));
      expect(metricRecoveries).toHaveLength(1);
      expect(metricRecoveries[0].title).toContain('Junction');
      expect(metricRecoveries[0].title).not.toContain('Core');
    });

    it('fires recovery after critical once temp is fully normal', () => {
      const data = buildData();
      data.gpus.set('test', [buildGpu(0, { coreTemp: 90 })]);
      service.evaluateAndNotify(data, settings);

      resetMock();
      // 80 is still above warn (70) — fires a warning, not a recovery
      data.gpus.set('test', [buildGpu(0, { coreTemp: 80 })]);
      service.evaluateAndNotify(data, settings);
      expect(mockNotifications.some((n) => n.title.includes('Warning'))).toBe(true);
      expect(mockNotifications.some((n) => n.title.includes('Temperature Recovered'))).toBe(false);

      // 60 < warn (70) — recovery fires
      resetMock();
      data.gpus.set('test', [buildGpu(0, { coreTemp: 60 })]);
      service.evaluateAndNotify(data, settings);
      const recovery = mockNotifications.find((n) => n.title.includes('Temperature Recovered') && n.title.includes('Core'));
      expect(recovery).toBeDefined();
    });
  });

  describe('agent transitions', () => {
    it('fires offline only on the transition, not every cycle while offline', () => {
      const data = buildData([buildAgent('test', EAgentStatus.Offline)]);
      data.fetchResult.set('test', 'fetch-failed');
      data.prevAgentStatus.set('test', EAgentStatus.Online);

      service.evaluateAndNotify(data, settings);
      expect(mockNotifications.filter((n) => n.title.includes('Offline'))).toHaveLength(1);

      // Second cycle still offline — no re-fire
      resetMock();
      service.evaluateAndNotify(data, settings);
      expect(mockNotifications.filter((n) => n.title.includes('Offline'))).toHaveLength(0);
    });

    it('fires online when agent returns', () => {
      const data = buildData([buildAgent('test', EAgentStatus.Online)]);
      data.fetchResult.set('test', 'ok');
      data.prevAgentStatus.set('test', EAgentStatus.Offline);
      data.gpus.set('test', [buildGpu()]);

      service.evaluateAndNotify(data, settings);
      expect(mockNotifications.some((n) => n.title.includes('Online'))).toBe(true);
    });
  });

  describe('all recovered', () => {
    it('fires all-recovered once after a full recovery cycle', () => {
      // Cycle 1: warning
      const data = buildData();
      data.gpus.set('test', [buildGpu(0, { coreTemp: 75 })]);
      service.evaluateAndNotify(data, settings);

      // Cycle 2: all normal — all-recovered fires
      resetMock();
      data.gpus.set('test', [buildGpu(0, { coreTemp: 60 })]);
      service.evaluateAndNotify(data, settings);
      expect(mockNotifications.some((n) => n.title.includes('All GPUs Recovered'))).toBe(true);

      // Cycle 3: still normal — no re-fire
      resetMock();
      service.evaluateAndNotify(data, settings);
      expect(mockNotifications.some((n) => n.title.includes('All GPUs Recovered'))).toBe(false);
    });

    it('does not fire all-recovered because of another agent warning', () => {
      const agent1 = buildAgent('a1');
      const agent2 = buildAgent('a2');
      const data = buildData([agent1, agent2]);
      // a1 warns, a2 normal
      data.gpus.set('a1', [buildGpu(0, { coreTemp: 75 })]);
      data.gpus.set('a2', [buildGpu(0, { coreTemp: 60 })]);
      service.evaluateAndNotify(data, settings);

      // a1 recovers, a2 still normal — a2 must NOT get all-recovered
      resetMock();
      data.gpus.set('a1', [buildGpu(0, { coreTemp: 60 })]);
      data.gpus.set('a2', [buildGpu(0, { coreTemp: 60 })]);
      service.evaluateAndNotify(data, settings);
      const allRecovered = mockNotifications.filter((n) => n.title.includes('All GPUs Recovered'));
      expect(allRecovered).toHaveLength(1);
      expect(allRecovered[0].title).toContain('a1');
    });
  });

  describe('unavailable (null) sensors', () => {
    it('does not evaluate or notify for null temps', () => {
      const data = buildData();
      data.gpus.set('test', [buildGpu(0, { junctionTemp: null, vramTemp: null })]);

      service.evaluateAndNotify(data, settings);
      expect(mockNotifications.filter((n) => n.title.includes('Junction') || n.title.includes('VRAM'))).toHaveLength(0);
    });

    it('does not fire recovery notification when a critical sensor becomes unavailable', () => {
      const data = buildData();
      data.gpus.set('test', [buildGpu(0, { junctionTemp: 97 })]);
      service.evaluateAndNotify(data, settings);
      expect(mockNotifications.filter((n) => n.title.includes('Junction'))).toHaveLength(1);

      resetMock();
      data.gpus.set('test', [buildGpu(0, { junctionTemp: null })]);
      service.evaluateAndNotify(data, settings);
      expect(mockNotifications.filter((n) => n.title.includes('Junction'))).toHaveLength(0);
    });
  });
});
