import { describe, expect, it } from 'vitest';

import { validateGpuResponse } from './gpu-validation';

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
});
