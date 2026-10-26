import type { IGpu } from '@gpu-monitor/shared';
import { describe, expect, it } from 'vitest';

import { MetricsHistoryService } from './MetricsHistoryService';

const T0 = 1_700_000_000_000;

function gpu(overrides: Partial<IGpu> = {}): IGpu {
  return {
    index: 0,
    name: 'Test GPU',
    uuid: 'GPU-000',
    coreTemp: 60,
    junctionTemp: 65,
    vramTemp: 55,
    gpuUtilization: 50,
    memoryUsed: 4e9,
    memoryTotal: 16e9,
    powerUsage: 200,
    ...overrides,
  };
}

describe('MetricsHistoryService', () => {
  it('computes simple means per window from stored samples', () => {
    const svc = new MetricsHistoryService();
    svc.record('a', [gpu({ coreTemp: 60 })], T0);
    svc.record('a', [gpu({ coreTemp: 70 })], T0 + 30_000);

    const [avg] = svc.getAverages('a', [gpu()]);
    expect(avg.coreTemp.m1).toBe(65);
    expect(avg.coreTemp.m5).toBe(65);
    expect(avg.coreTemp.m10).toBe(65);
  });

  it('window edges are inclusive at exactly the window age', () => {
    const svc = new MetricsHistoryService();
    svc.record('a', [gpu({ coreTemp: 50 })], T0);
    svc.record('a', [gpu({ coreTemp: 70 })], T0 + 60_000);
    svc.record('a', [gpu({ coreTemp: 90 })], T0 + 360_000);

    const [avg] = svc.getAverages('a', [gpu()]);
    // m1 window (latest 360s − 60s = 300s): only samples at 360 qualify... none between 300..360 except 360 itself
    expect(avg.coreTemp.m1).toBe(90);
    // m5 window from 60s: samples at 60 (70) and 360 (90)
    expect(avg.coreTemp.m5).toBe(80);
    // m10 window from −240s: all three samples
    expect(avg.coreTemp.m10).toBeCloseTo((50 + 70 + 90) / 3);
  });

  it('partial windows show the mean of available samples immediately', () => {
    const svc = new MetricsHistoryService();
    svc.record('a', [gpu({ powerUsage: 120 })], T0);

    const [avg] = svc.getAverages('a', [gpu()]);
    expect(avg.powerUsage.m1).toBe(120);
    expect(avg.powerUsage.m10).toBe(120);
  });

  it('prunes samples older than the 10-minute window', () => {
    const svc = new MetricsHistoryService();
    svc.record('a', [gpu({ coreTemp: 100 })], T0);
    svc.record('a', [gpu({ coreTemp: 40 })], T0 + 600_001);

    const [avg] = svc.getAverages('a', [gpu()]);
    // 100 is 600001 ms old — just outside the 600_000 ms window and pruned at record time
    expect(avg.coreTemp.m10).toBe(40);
  });

  it('skips null samples and reports a null window when none qualify', () => {
    const svc = new MetricsHistoryService();
    svc.record('a', [gpu({ junctionTemp: null, fanSpeed: 40 })], T0);
    svc.record('a', [gpu({ junctionTemp: 70, fanSpeed: 60 })], T0 + 10_000);

    const [avg] = svc.getAverages('a', [gpu()]);
    expect(avg.junctionTemp.m1).toBe(70);
    expect(avg.fanSpeed.m1).toBe(50);

    const [fresh] = new MetricsHistoryService().getAverages('a', [gpu()]);
    expect(fresh.coreTemp.m1).toBeNull();
  });

  it('junction-only history stays null while optional absent metrics stay null', () => {
    const svc = new MetricsHistoryService();
    svc.record('a', [gpu({ memClockMHz: undefined })], T0);

    const [avg] = svc.getAverages('a', [gpu()]);
    expect(avg.memClockMHz.m10).toBeNull();
    expect(avg.coreTemp.m10).toBe(60);
  });

  it('averages freeze while no new samples arrive (stale agent)', () => {
    const svc = new MetricsHistoryService();
    svc.record('a', [gpu({ coreTemp: 62 })], T0);

    const [first] = svc.getAverages('a', [gpu()]);
    // much later — no new samples, the stored latest timestamp is unchanged
    svc.record('b', [gpu()], T0 + 3_600_000);
    const [frozen] = svc.getAverages('a', [gpu()]);

    expect(frozen).toEqual(first);
    expect(frozen.coreTemp.m1).toBe(62);
  });

  it('tracks multiple GPUs of one agent independently', () => {
    const svc = new MetricsHistoryService();
    svc.record('a', [gpu({ index: 0, coreTemp: 50 }), gpu({ index: 1, coreTemp: 90 })], T0);

    const [g0, g1] = svc.getAverages('a', [gpu({ index: 0 }), gpu({ index: 1 })]);
    expect(g0.coreTemp.m1).toBe(50);
    expect(g1.coreTemp.m1).toBe(90);
  });

  it('getAverages returns all-null windows for an unknown agent', () => {
    const svc = new MetricsHistoryService();
    const [avg] = svc.getAverages('unknown', [gpu()]);
    expect(avg.coreTemp).toEqual({ m1: null, m5: null, m10: null });
    expect(avg.memClockMHz).toEqual({ m1: null, m5: null, m10: null });
  });

  it('reset clears all history', () => {
    const svc = new MetricsHistoryService();
    svc.record('a', [gpu()], T0);
    svc.reset();

    const [avg] = svc.getAverages('a', [gpu()]);
    expect(avg.coreTemp.m1).toBeNull();
  });
});
