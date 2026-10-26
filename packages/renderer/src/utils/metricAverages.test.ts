import { describe, expect, it } from 'vitest';

import { GB } from './constants';
import { avgDisplay } from './metricAverages';

describe('avgDisplay', () => {
  it('returns null when windows are missing or all null', () => {
    expect(avgDisplay(undefined, { unit: '°C' })).toBeNull();
    expect(avgDisplay({ m1: null, m5: null, m10: null }, { unit: '°C' })).toBeNull();
  });

  it('renders " · "-separated integers and a labelled tooltip', () => {
    const result = avgDisplay({ m1: 64.2, m5: 62.4, m10: 60.5 }, { unit: '°C' });
    expect(result?.line).toBe('64 · 62 · 61');
    expect(result?.tooltip).toBe('1m: 64°C · 5m: 62°C · 10m: 61°C');
  });

  it('omits windows without samples from line and tooltip', () => {
    const result = avgDisplay({ m1: 64, m5: null, m10: 60 }, { unit: '%' });
    expect(result?.line).toBe('64 · 60');
    expect(result?.tooltip).toBe('1m: 64% · 10m: 60%');
  });

  it('converts memory bytes to GB with one decimal', () => {
    const result = avgDisplay(
      { m1: 24.13 * GB, m5: 23.86 * GB, m10: 23.61 * GB },
      { unit: 'GB', decimals: 1, scale: 1 / GB },
    );
    expect(result?.line).toBe('24.1 · 23.9 · 23.6');
    expect(result?.tooltip).toBe('1m: 24.1GB · 5m: 23.9GB · 10m: 23.6GB');
  });
});
