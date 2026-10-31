import { EAgentStatus } from '@gpu-monitor/shared';
import type { IGpu, IGpuAverages, IMetricWindows, ISettings } from '@gpu-monitor/shared';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, it, expect } from 'vitest';

import '@testing-library/jest-dom';

import { GB } from '../utils/constants';
import { getAgentStatusLabel } from '../utils/statusDisplay';

import { GpuDetailModal, getPerfStateLabel } from './GpuDetailModal';

describe('getPerfStateLabel', () => {
  it('returns N/A for undefined', () => {
    expect(getPerfStateLabel(undefined)).toBe('N/A');
  });

  it('returns P0 (Max) for 0', () => {
    expect(getPerfStateLabel(0)).toBe('P0 (Max)');
  });

  it('returns P1-P3 (High) for values 1-3', () => {
    expect(getPerfStateLabel(1)).toBe('P1 (High)');
    expect(getPerfStateLabel(2)).toBe('P2 (High)');
    expect(getPerfStateLabel(3)).toBe('P3 (High)');
  });

  it('returns P4-P6 (Mid) for values 4-6', () => {
    expect(getPerfStateLabel(4)).toBe('P4 (Mid)');
    expect(getPerfStateLabel(5)).toBe('P5 (Mid)');
    expect(getPerfStateLabel(6)).toBe('P6 (Mid)');
  });

  it('returns P7+ (Low) for values above 6', () => {
    expect(getPerfStateLabel(7)).toBe('P7 (Low)');
    expect(getPerfStateLabel(10)).toBe('P10 (Low)');
  });
});

describe('getAgentStatusLabel', () => {
  it('returns Online for Online status', () => {
    expect(getAgentStatusLabel(EAgentStatus.Online)).toBe('Online');
  });

  it('returns Offline for Offline status', () => {
    expect(getAgentStatusLabel(EAgentStatus.Offline)).toBe('Offline');
  });

  it('returns Stale for Stale status', () => {
    expect(getAgentStatusLabel(EAgentStatus.Stale)).toBe('Stale');
  });

  it('returns Pending for Pending status', () => {
    expect(getAgentStatusLabel(EAgentStatus.Pending)).toBe('Pending');
  });
});

const win = (m1: number | null, m5: number | null, m10: number | null): IMetricWindows => ({ m1, m5, m10 });

const fullAverages: IGpuAverages = {
  coreTemp: win(64, 62, 60),
  junctionTemp: win(70, 68, 66),
  vramTemp: win(58, 56, 54),
  gpuUtilization: win(40, 35, 30),
  memoryUsed: win(24.1 * GB, 23.9 * GB, 23.6 * GB),
  powerUsage: win(210, 205, 200),
  fanSpeed: win(50, 45, 40),
  gpuClockMHz: win(1500, 1400, 1300),
  memClockMHz: win(2000, 1950, 1900),
};

const fullGpu: IGpu = {
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
  fanSpeed: 55,
  gpuClockMHz: 1600,
  memClockMHz: 2100,
};

const modalSettings: ISettings = {
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

function renderModal(gpu: IGpu, averages?: IGpuAverages): void {
  render(
    <GpuDetailModal
      gpu={gpu}
      gpuIndex={0}
      agentName="Test Agent"
      agentStatus={EAgentStatus.Online}
      averages={averages}
      settings={modalSettings}
      onClose={() => {}}
    />,
  );
}

const noWindows = win(null, null, null);

describe('GpuDetailModal averages micro-lines', () => {
  it('renders a line for all nine averaged metrics', () => {
    renderModal(fullGpu, fullAverages);
    expect(screen.getAllByTitle(/1m:/)).toHaveLength(9);
    expect(screen.getByTitle('1m: 24.1GB · 5m: 23.9GB · 10m: 23.6GB')).toHaveTextContent('24.1 · 23.9 · 23.6');
    expect(screen.getByTitle('1m: 1500MHz · 5m: 1400MHz · 10m: 1300MHz')).toHaveTextContent('1500 · 1400 · 1300');
  });

  it('omits lines for null sensors and absent optional metrics', () => {
    renderModal(
      { ...fullGpu, junctionTemp: null, vramTemp: null, fanSpeed: undefined, gpuClockMHz: undefined, memClockMHz: undefined },
      {
        ...fullAverages,
        junctionTemp: noWindows,
        vramTemp: noWindows,
        fanSpeed: noWindows,
        gpuClockMHz: noWindows,
        memClockMHz: noWindows,
      },
    );
    expect(screen.getAllByTitle(/1m:/)).toHaveLength(4);
  });

  it('renders no lines without averages data', () => {
    renderModal(fullGpu, undefined);
    expect(screen.queryAllByTitle(/1m:/)).toHaveLength(0);
  });
});

describe('GpuDetailModal driver version', () => {
  it('shows the GPU\'s own driver version', () => {
    renderModal({ ...fullGpu, driverVersion: '610.43.03' });
    expect(screen.getByText('Driver: 610.43.03')).toBeInTheDocument();
  });

  it('renders a different GPU\'s different driver, not another host\'s', () => {
    // Regression: the old App-level global always fed the first agent's driver
    // into every modal. Each modal must derive from its own GPU object.
    renderModal({ ...fullGpu, driverVersion: '615.71.09' });
    expect(screen.getByText('Driver: 615.71.09')).toBeInTheDocument();
    expect(screen.queryByText('Driver: 610.43.03')).toBeNull();
  });

  it('hides the driver line when the GPU reports no driver version', () => {
    renderModal(fullGpu);
    expect(screen.queryByText(/Driver:/)).toBeNull();
  });

  it('hides the driver line when the driver version is an empty string', () => {
    renderModal({ ...fullGpu, driverVersion: '' });
    expect(screen.queryByText(/Driver:/)).toBeNull();
  });
});
