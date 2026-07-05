import { z } from 'zod';

import { EAgentStatus } from '@gpu-monitor/shared';

const tempThresholdSchema = z.object({
  warn: z.number(),
  critical: z.number(),
});

const notificationCooldownsSchema = z.object({
  tempCritical: z.number().int().positive(),
  tempWarn: z.number().int().positive(),
  tempRecover: z.number().int().positive(),
  agentOffline: z.number().int().positive(),
  agentOnline: z.number().int().positive(),
  allRecovered: z.number().int().positive(),
});

const notificationsConfigSchema = z.object({
  enabled: z.boolean(),
  cooldowns: notificationCooldownsSchema,
});

const agentUrlSchema = z.string().refine(
  (url) => {
    try {
      const parsed = new URL(url);

      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  },
  { message: 'URL must be http:// or https://' },
);

export const settingsSchema = z.object({
  agents: z.array(z.object({
    id: z.string(),
    name: z.string(),
    url: agentUrlSchema,
    status: z.nativeEnum(EAgentStatus).optional(),
    lastError: z.string().optional(),
    lastUpdate: z.number().optional(),
  })),
  refreshInterval: z.number().int().positive(),
  thresholds: z.object({
    core: tempThresholdSchema,
    junction: tempThresholdSchema,
    vram: tempThresholdSchema,
  }),
  notifications: notificationsConfigSchema,
});
