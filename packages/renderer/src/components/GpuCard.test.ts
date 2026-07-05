import { describe, it, expect } from 'vitest';

import { formatValue } from './GpuCard';
import { getMemoryStatus } from '../utils/constants';

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
