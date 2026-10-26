import type { MetricStatus } from '@gpu-monitor/shared';
import React from 'react';

import { getStatusColor } from '../utils/statusDisplay';

interface GpuBarProps {
  /** null = sensor unavailable */
  value: number | null;
  max: number;
  status: MetricStatus;
  animated?: boolean;
}

export const GpuBar: React.FC<GpuBarProps> = ({
  value,
  max,
  status,
  animated = true,
}) => {
  const percentage = value === null ? 0 : Math.min((value / max) * 100, 100);
  const statusColor = getStatusColor(status);

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
    </div>
  );
};
