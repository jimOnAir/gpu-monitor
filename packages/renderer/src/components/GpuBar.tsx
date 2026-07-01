import React from 'react';
import { IGpu } from '@gpu-monitor/shared';

const GB = 1024 * 1024 * 1024;

interface GpuBarProps {
  value: number;
  max: number;
  unit?: string;
  status: 'normal' | 'warning' | 'danger';
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
    ? `${(value / GB).toFixed(1)}/${(max / GB).toFixed(0)}GB`
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

function getStatusColor(status: 'normal' | 'warning' | 'danger'): string {
  switch (status) {
    case 'normal':
      return 'var(--status-normal, #4CAF50)';
    case 'warning':
      return 'var(--status-warning, #FFC107)';
    case 'danger':
      return 'var(--status-danger, #F44336)';
  }
}
