import { EAgentStatus } from '@gpu-monitor/shared';
import { describe, it, expect } from 'vitest';

import { getAgentStatusLabel } from '../utils/statusDisplay';

import { getPerfStateLabel } from './GpuDetailModal';

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
