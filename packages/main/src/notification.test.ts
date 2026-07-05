import { describe, it, expect } from 'vitest';

import { settingsSchema } from './settings';

describe('settingsSchema', () => {
  it('validates correct settings', () => {
    const validSettings = {
      agents: [{ id: 'agent-1', name: 'Test Agent', url: 'http://localhost:9091' }],
      refreshInterval: 5000,
      thresholds: {
        core: { warn: 70, critical: 85 },
        junction: { warn: 75, critical: 90 },
        vram: { warn: 70, critical: 85 },
      },
      notifications: {
        enabled: true,
        cooldowns: {
          tempCritical: 60000,
          tempWarn: 120000,
          tempRecover: 60000,
          agentOffline: 30000,
          agentOnline: 30000,
          allRecovered: 300000,
        },
      },
    };

    const result = settingsSchema.safeParse(validSettings);
    expect(result.success).toBe(true);
  });

  it('rejects invalid threshold values', () => {
    const invalidSettings = {
      agents: [{ id: 'agent-1', name: 'Test Agent', url: 'http://localhost:9091' }],
      refreshInterval: 5000,
      thresholds: {
        core: { warn: 'not-a-number', critical: 85 },
        junction: { warn: 75, critical: 90 },
        vram: { warn: 70, critical: 85 },
      },
      notifications: {
        enabled: true,
        cooldowns: {
          tempCritical: 60000,
          tempWarn: 120000,
          tempRecover: 60000,
          agentOffline: 30000,
          agentOnline: 30000,
          allRecovered: 300000,
        },
      },
    };

    const result = settingsSchema.safeParse(invalidSettings);
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const invalidSettings = {
      agents: [],
      // Missing refreshInterval, thresholds, notifications
    };

    const result = settingsSchema.safeParse(invalidSettings);
    expect(result.success).toBe(false);
  });
});
