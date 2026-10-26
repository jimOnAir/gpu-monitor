import { DEFAULT_SETTINGS, EAgentStatus } from '@gpu-monitor/shared';
import type { IAgent, IGpu } from '@gpu-monitor/shared';
import type { Logger } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentData } from '../polling/AgentData';

import type { IIconLoader } from './IIconLoader';
import type { ITrayFactory } from './ITrayFactory';
import type { ITrayHandle } from './ITrayHandle';
import { TrayService } from './TrayService';

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as unknown as Logger;

function buildAgent(id = 'test'): IAgent {
  return { id, name: id, url: 'http://localhost:9091', status: EAgentStatus.Online };
}

function buildGpu(overrides: Partial<IGpu> = {}): IGpu {
  return {
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
    ...overrides,
  };
}

function buildData(gpus: IGpu[]): AgentData {
  return {
    agents: [buildAgent()],
    gpus: new Map([['test', gpus]]),
    lastUpdate: new Map(),
    lastFetchTimestamp: new Map(),
    statusChangedAt: new Map(),
    fetchResult: new Map(),
    prevAgentStatus: new Map(),
    averages: new Map(),
  };
}

describe('TrayService', () => {
  let tooltips: string[];
  let trayHandle: ITrayHandle;
  let factory: ITrayFactory;
  let iconLoader: IIconLoader;
  let service: TrayService;

  beforeEach(() => {
    tooltips = [];
    trayHandle = {
      setToolTip: (t: string) => tooltips.push(t),
      setImage: vi.fn(),
      on: vi.fn(),
      setContextMenu: vi.fn(),
    };
    factory = {
      create: () => trayHandle,
      buildContextMenu: () => ({}),
      setContextMenu: vi.fn(),
    };
    iconLoader = {
      loadIcon: vi.fn(() => 'icon'),
      loadBuildIcon: vi.fn(() => 'build-icon'),
    };
    service = new TrayService(mockLogger, factory, iconLoader);
    service.createTray({
      onShow: vi.fn(),
      onRefresh: vi.fn(),
      onOpenSettings: vi.fn(),
      onExit: vi.fn(),
    });
  });

  it('renders -- for unavailable (null) sensors in the tooltip', () => {
    service.updateTrayFromData(
      buildData([buildGpu({ junctionTemp: null, vramTemp: null })]),
      DEFAULT_SETTINGS,
    );

    expect(tooltips[tooltips.length - 1]).toContain('60/--/--');
  });

  it('keeps normal icon when a null sensor replaces a warning one', () => {
    service.updateTrayFromData(
      buildData([buildGpu({ junctionTemp: 85 })]),
      DEFAULT_SETTINGS,
    );
    expect(iconLoader.loadIcon).toHaveBeenLastCalledWith('warning');

    service.updateTrayFromData(
      buildData([buildGpu({ junctionTemp: null })]),
      DEFAULT_SETTINGS,
    );
    expect(iconLoader.loadIcon).toHaveBeenLastCalledWith('normal');
  });
});
