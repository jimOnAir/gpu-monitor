import type { IGpu, IGpuAverages, IMetricWindows, ISettings } from '@gpu-monitor/shared';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, it, expect } from 'vitest';

import '@testing-library/jest-dom';

import { getMemoryStatus, GB } from '../utils/constants';
import { formatValue } from '../utils/statusDisplay';

import { GpuCard } from './GpuCard';

describe('formatValue', () => {
  it('shows detail format when showDetail is true', () => {
    expect(formatValue(500, 1000, 'W', true)).toBe('500/1000W');
  });

  it('shows watt format without detail', () => {
    expect(formatValue(500, 1000, 'W')).toBe('500W');
  });

  it('shows GB format for byte units', () => {
    expect(formatValue(2147483648, 4294967296, 'B')).toBe('2GB');
  });

  it('rounds and adds unit for other cases', () => {
    expect(formatValue(75.7, 100, 'C')).toBe('76C');
    expect(formatValue(95, 100, '%')).toBe('95%');
  });

  it('shows -- for unavailable (null) sensors', () => {
    expect(formatValue(null, 100, '°C')).toBe('--');
    expect(formatValue(null, 1000, 'W', true)).toBe('--');
  });

  it('shows MB format for byte units with detail', () => {
    expect(formatValue(500, 1000, 'B', true)).toBe('500/1000B');
  });
});

describe('getMemoryStatus', () => {
  it('returns danger when ratio > 0.9', () => {
    expect(getMemoryStatus(950, 1000)).toBe('danger');
  });

  it('returns warning when ratio > 0.7', () => {
    expect(getMemoryStatus(800, 1000)).toBe('warning');
  });

  it('returns normal when ratio <= 0.7', () => {
    expect(getMemoryStatus(700, 1000)).toBe('normal');
    expect(getMemoryStatus(500, 1000)).toBe('normal');
  });

  it('returns danger for exactly 0.95 ratio', () => {
    expect(getMemoryStatus(950, 1000)).toBe('danger');
  });
});

const win = (m1: number | null, m5: number | null, m10: number | null): IMetricWindows => ({ m1, m5, m10 });

function buildGpu(overrides: Partial<IGpu> = {}): IGpu {
  return {
    index: 0,
    name: 'NVIDIA GPU 0',
    uuid: 'GPU-uuid-1',
    coreTemp: 65,
    junctionTemp: 70,
    vramTemp: 60,
    gpuUtilization: 45,
    memoryUsed: 4 * GB,
    memoryTotal: 8 * GB,
    powerUsage: 150,
    ...overrides,
  };
}

const testSettings: ISettings = {
  agents: [],
  refreshInterval: 5000,
  thresholds: {
    core: { warn: 70, critical: 85 },
    junction: { warn: 80, critical: 95 },
    vram: { warn: 80, critical: 95 },
  },
  notifications: {
    enabled: true,
    cooldowns: { tempCritical: 60000, tempWarn: 120000, tempRecover: 60000, agentOffline: 30000, agentOnline: 30000, allRecovered: 300000 },
  },
};

function buildAverages(overrides: Partial<IGpuAverages> = {}): IGpuAverages {
  const none = win(null, null, null);

  return {
    coreTemp: none,
    junctionTemp: none,
    vramTemp: none,
    gpuUtilization: none,
    memoryUsed: none,
    powerUsage: none,
    fanSpeed: none,
    gpuClockMHz: none,
    memClockMHz: none,
    ...overrides,
  };
}

describe('GpuCard averages micro-line', () => {
  it('renders a line for every card metric with data', () => {
    render(
      <GpuCard
        gpu={buildGpu()}
        index={0}
        settings={testSettings}
        averages={buildAverages({
          coreTemp: win(64, 62, 60),
          junctionTemp: win(70, 68, 66),
          vramTemp: win(58, 56, 54),
          gpuUtilization: win(40, 35, 30),
          memoryUsed: win(24.1 * GB, 23.9 * GB, 23.6 * GB),
          powerUsage: win(210, 205, 200),
        })}
      />,
    );
    const lines = screen.getAllByTitle(/1m:/);
    expect(lines).toHaveLength(6);
    expect(lines[0]).toHaveTextContent('64 · 62 · 60');
    expect(screen.getByTitle('1m: 24.1GB · 5m: 23.9GB · 10m: 23.6GB')).toHaveTextContent('24.1 · 23.9 · 23.6');
  });

  it('omits the line for a fully-null sensor', () => {
    render(
      <GpuCard
        gpu={buildGpu({ junctionTemp: null, vramTemp: null })}
        index={0}
        settings={testSettings}
        averages={buildAverages({
          coreTemp: win(64, 62, 60),
          gpuUtilization: win(40, 35, 30),
          memoryUsed: win(GB, GB, GB),
          powerUsage: win(210, 205, 200),
        })}
      />,
    );
    expect(screen.getAllByTitle(/1m:/)).toHaveLength(4);
  });

  it('renders no lines when averages are absent', () => {
    render(<GpuCard gpu={buildGpu()} index={0} settings={testSettings} />);
    expect(screen.queryAllByTitle(/1m:/)).toHaveLength(0);
  });
});
