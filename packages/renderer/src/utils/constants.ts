/**
 * Shared constants and utility functions for GPU monitoring components.
 * Centralizes values that are used across multiple components.
 */

import { EAgentStatus } from '@gpu-monitor/shared';

/** Bytes in one gibibyte (1024^3). */
export const GB = 1024 * 1024 * 1024;

/**
 * Map EAgentStatus to its display label.
 * Centralized so all components use the same labels.
 */
export function getAgentStatusLabel(status?: EAgentStatus): string {
  switch (status) {
    case EAgentStatus.Pending:
      return 'Pending';
    case EAgentStatus.Online:
      return 'Online';
    case EAgentStatus.Offline:
      return 'Offline';
    case EAgentStatus.Stale:
      return 'Stale';
    default:
      return 'Unknown';
  }
}

/** Threshold ratios for memory utilization status. */
const MEMORY_THRESHOLDS = {
  danger: 0.9,
  warning: 0.7,
} as const;

/** Threshold ratios for power utilization status. */
const POWER_THRESHOLDS = {
  danger: 0.9,
  warning: 0.7,
} as const;

/** Absolute power thresholds (watts) for GPUs without a power cap. */
const POWER_ABS_THRESHOLDS = {
  danger: 800,
  warning: 600,
} as const;

/**
 * Determine memory utilization status based on used/total ratio.
 */
export function getMemoryStatus(used: number, total: number): 'normal' | 'warning' | 'danger' {
  const ratio = used / total;
  if (ratio > MEMORY_THRESHOLDS.danger) {
    return 'danger';
  }
  if (ratio > MEMORY_THRESHOLDS.warning) {
    return 'warning';
  }

  return 'normal';
}

/**
 * Determine power utilization status based on usage and optional power cap.
 */
export function getPowerStatus(usage: number, powerCapW?: number): 'normal' | 'warning' | 'danger' {
  if (powerCapW) {
    if (usage > powerCapW * POWER_THRESHOLDS.danger) {
      return 'danger';
    }
    if (usage > powerCapW * POWER_THRESHOLDS.warning) {
      return 'warning';
    }
  } else {
    if (usage > POWER_ABS_THRESHOLDS.danger) {
      return 'danger';
    }
    if (usage > POWER_ABS_THRESHOLDS.warning) {
      return 'warning';
    }
  }

  return 'normal';
}

/**
 * Determine GPU utilization status based on utilization percentage.
 */
export function getGpuUtilizationStatus(utilization: number): 'normal' | 'warning' | 'danger' {
  if (utilization > 90) {
    return 'danger';
  }
  if (utilization > 70) {
    return 'warning';
  }

  return 'normal';
}
