import { EAgentStatus } from './enums/EAgentStatus';
import type { ISettings } from './types/ISettings';

/**
 * Single source of truth for metric status evaluation.
 * Consumed by main (tray, notifications) and renderer (UI colors).
 * One label vocabulary: normal | warning | danger.
 */

export type MetricStatus = 'normal' | 'warning' | 'danger';

/** Default settings applied when no settings file exists. */
export const DEFAULT_SETTINGS: ISettings = {
  agents: [
    {
      id: 'localhost',
      name: 'localhost',
      url: 'http://localhost:9091',
      status: EAgentStatus.Offline,
    },
  ],
  refreshInterval: 5000,
  thresholds: {
    core: { warn: 70, critical: 85 },
    junction: { warn: 80, critical: 95 },
    vram: { warn: 80, critical: 95 },
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

/**
 * Evaluate a temperature against warn/critical thresholds.
 * Pure function — no side effects.
 * A null temperature means the sensor is unavailable: it never escalates.
 */
export function evaluateStatus(temp: number | null, warn: number, critical: number): MetricStatus {
  if (temp === null) {
    return 'normal';
  }
  if (temp >= critical) {
    return 'danger';
  }
  if (temp >= warn) {
    return 'warning';
  }

  return 'normal';
}

/**
 * Return the worst status among the given statuses.
 * danger > warning > normal.
 */
export function worstStatus(current: MetricStatus, ...others: MetricStatus[]): MetricStatus {
  const all = [current, ...others];
  if (all.includes('danger')) {
    return 'danger';
  }
  if (all.includes('warning')) {
    return 'warning';
  }

  return 'normal';
}
