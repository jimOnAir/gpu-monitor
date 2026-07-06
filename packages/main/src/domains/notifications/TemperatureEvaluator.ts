import type { IGpu, ITemperatureThresholds } from '@gpu-monitor/shared';

export type MetricStatus = 'normal' | 'warning' | 'danger';

export interface TemperatureMetric {
  metric: string;
  temp: number;
  warn: number;
  critical: number;
  status: MetricStatus;
}

/**
 * Evaluates GPU temperature metrics against per-metric thresholds.
 * Pure logic — no side effects, no state, no notification dispatch.
 */
export class TemperatureEvaluator {
  /**
   * Evaluate a single metric against its thresholds.
   */
  evaluateMetric(temp: number, warn: number, critical: number): MetricStatus {
    if (temp >= critical) {
      return 'danger';
    }
    if (temp >= warn) {
      return 'warning';
    }

    return 'normal';
  }

  /**
   * Gather all temperature metrics from a GPU list using configured thresholds.
   * Extracts core/junction/vram temperatures and their status.
   */
  gatherMetrics(gpuList: IGpu[], thresholds: ITemperatureThresholds): TemperatureMetric[] {
    const keyMap: Array<{ key: keyof ITemperatureThresholds, tempKey: keyof IGpu, statusKey: keyof IGpu }> = [
      { key: 'core', tempKey: 'coreTemp', statusKey: 'coreStatus' },
      { key: 'junction', tempKey: 'junctionTemp', statusKey: 'junctionStatus' },
      { key: 'vram', tempKey: 'vramTemp', statusKey: 'vramStatus' },
    ];

    const metrics: TemperatureMetric[] = [];

    for (const gpu of gpuList) {
      for (const { key, tempKey, statusKey } of keyMap) {
        metrics.push({
          metric: key,
          temp: gpu[tempKey] as number,
          warn: thresholds[key].warn,
          critical: thresholds[key].critical,
          status: gpu[statusKey] as MetricStatus,
        });
      }
    }

    return metrics;
  }
}
