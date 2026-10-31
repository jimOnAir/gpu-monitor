import { describe, expect, it } from 'vitest';

import { normalizeSensorTemp, validateGpuResponse } from './gpu-validation';

function buildAgentGpu(overrides: Record<string, unknown> = {}) {
  return {
    index: 0,
    name: 'Test GPU',
    uuid: 'GPU-000',
    coreTemp: 40,
    junctionTemp: 50,
    vramTemp: 45,
    gpuUtilization: 10,
    memoryUsed: 1,
    memoryTotal: 2,
    powerUsage: 10,
    ...overrides,
  };
}

describe('validateGpuResponse', () => {
  it('accepts null junction/vram temps (sensor unavailable)', () => {
    const parsed = validateGpuResponse({
      gpus: [buildAgentGpu({ junctionTemp: null, vramTemp: null })],
      timestamp: 123,
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.gpus[0]?.junctionTemp).toBeNull();
    expect(parsed?.gpus[0]?.vramTemp).toBeNull();
  });

  it('still rejects malformed temps', () => {
    expect(validateGpuResponse({ gpus: [buildAgentGpu({ junctionTemp: 'hot' })] })).toBeNull();
    expect(validateGpuResponse({ gpus: [buildAgentGpu({ vramTemp: {} })] })).toBeNull();
  });

  it('normalizes implausible junction/vram readings to null (sensor unavailable)', () => {
    for (const implausible of [0, 0.5, -5, 255, 300]) {
      const parsed = validateGpuResponse({
        gpus: [buildAgentGpu({ junctionTemp: implausible, vramTemp: implausible })],
      });

      expect(parsed).not.toBeNull();
      expect(parsed?.gpus[0]?.junctionTemp).toBeNull();
      expect(parsed?.gpus[0]?.vramTemp).toBeNull();
    }
  });

  it('keeps plausible band values (1 <= t < 255) intact', () => {
    for (const plausible of [1, 56, 254.9]) {
      const parsed = validateGpuResponse({
        gpus: [buildAgentGpu({ junctionTemp: plausible, vramTemp: plausible })],
      });

      expect(parsed?.gpus[0]?.junctionTemp).toBe(plausible);
      expect(parsed?.gpus[0]?.vramTemp).toBe(plausible);
    }
  });

  it('does not gate coreTemp', () => {
    const parsed = validateGpuResponse({ gpus: [buildAgentGpu({ coreTemp: 0 })] });

    expect(parsed?.gpus[0]?.coreTemp).toBe(0);
  });

  it('passes agentVersion through, and accepts responses without it (pre-1.0.0 agents)', () => {
    const withVersion = validateGpuResponse({
      gpus: [buildAgentGpu()], timestamp: 1, agentVersion: '1.0.0',
    });
    const withoutVersion = validateGpuResponse({ gpus: [buildAgentGpu()] });

    expect(withVersion?.agentVersion).toBe('1.0.0');
    expect(withoutVersion).not.toBeNull();
    expect(withoutVersion?.agentVersion).toBeUndefined();
  });
});

describe('normalizeSensorTemp', () => {
  it('null passes through', () => {
    expect(normalizeSensorTemp(null)).toBeNull();
  });

  it('rejects values below 1 and at or above 255', () => {
    expect(normalizeSensorTemp(0.9)).toBeNull();
    expect(normalizeSensorTemp(255)).toBeNull();
  });

  it('accepts the band', () => {
    expect(normalizeSensorTemp(1)).toBe(1);
    expect(normalizeSensorTemp(254)).toBe(254);
  });
});
