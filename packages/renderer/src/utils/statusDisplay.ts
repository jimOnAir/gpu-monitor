import { EAgentStatus, type MetricStatus } from '@gpu-monitor/shared';

import { GB } from './constants';

/**
 * Single source of truth for display vocabulary:
 * status labels, status colors, and value formatting.
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

export function getStatusColor(status: MetricStatus): string {
  switch (status) {
    case 'normal':
      return 'var(--status-normal, #4CAF50)';
    case 'warning':
      return 'var(--status-warning, #FFC107)';
    case 'danger':
      return 'var(--status-danger, #F44336)';
  }
}

export function formatValue(value: number | null, max: number, unit: string, showDetail?: boolean): string {
  if (value === null) {
    return '--';
  }
  if (showDetail) {
    return `${value.toFixed(0)}/${max.toFixed(0)}${unit}`;
  }
  if (unit === 'W') {
    return `${value.toFixed(0)}W`;
  }
  if (unit === 'B') {
    return `${(value / GB).toFixed(0)}GB`;
  }

  return `${Math.round(value)}${unit}`;
}
