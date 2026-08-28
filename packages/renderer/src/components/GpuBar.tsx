import type { MetricStatus } from '@gpu-monitor/shared';
import React from 'react';

import { getStatusColor } from '../utils/statusDisplay';

interface GpuBarProps {
  value: number;
  max: number;
  unit?: string;
  status: MetricStatus;
  showDetail?: boolean;
  animated?: boolean;
}

export const GpuBar: React.FC<GpuBarProps> = ({
  value,
  max,
  unit = '%',
  status,
  showDetail,
  animated = true,
}) => {
  const percentage = Math.min((value / max) * 100, 100);
  const statusColor = getStatusColor(status);

  const displayValue = showDetail
    ? `${value.toFixed(0)}/${max.toFixed(0)}${unit}`
    : `${Math.round(value)}${unit}`;

  return (
    <div className="gpu-bar-container">
      {/* Background */}
      <div className="gpu-bar-bg" />

      {/* Fill */}
      <div
        className="gpu-bar-fill"
        style={{
          width: `${percentage}%`,
          backgroundColor: statusColor,
          transition: animated ? 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
        }}
      />

      {/* Danger pulse */}
      {status === 'danger' && <div className="gpu-bar-pulse" />}

      {/* Text overlay */}
      <div className="gpu-bar-text">{displayValue}</div>
    </div>
  );
};
