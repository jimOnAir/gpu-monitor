import type { IGpu } from '@gpu-monitor/shared';
import React from 'react';

import { GpuBar } from './GpuBar';

interface GpuCardProps {
  gpu: IGpu;
  index: number;
  agentName: string;
  onClick?: () => void;
}

export const GpuCard: React.FC<GpuCardProps> = ({ gpu, index, agentName: _agentName, onClick }) => {
  return (
    <div
      className={`gpu-card${onClick ? ' gpu-card-clickable' : ''}`}
      role={onClick ? 'button' : 'region'}
      aria-label={`GPU ${index}: ${gpu.name}`}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault(); onClick();
        }
      } : undefined}
    >
      {/* Header */}
      <div className="gpu-card-header">
        <span className="gpu-card-index">GPU {index}</span>
        <div className="gpu-card-identity">
          <span className="gpu-card-name" title={gpu.name}>
            {gpu.name}
          </span>
          {gpu.vendor && (
            <span className="gpu-card-sub" title={`${gpu.vendor} ${gpu.model || ''}`.trim()}>
              {gpu.vendor}{gpu.model ? ` ${gpu.model}` : ''}
            </span>
          )}
        </div>
      </div>

      {/* Temperature Section */}
      <div className="gpu-card-section">
        <GpuRow label="Core" value={gpu.coreTemp} max={100} unit="°C" status={gpu.coreStatus} />
        <GpuRow label="Junction" value={gpu.junctionTemp} max={100} unit="°C" status={gpu.junctionStatus} />
        <GpuRow label="VRAM" value={gpu.vramTemp} max={100} unit="°C" status={gpu.vramStatus} />
      </div>

      {/* Separator */}
      <div className="gpu-card-separator">
        <span>▸ Utilization</span>
      </div>

      {/* Utilization Section */}
      <div className="gpu-card-section">
        <GpuRow
          label="GPU"
          value={gpu.gpuUtilization}
          max={100}
          unit="%"
          status={gpu.gpuUtilization > 90 ? 'danger' : gpu.gpuUtilization > 70 ? 'warning' : 'normal'}
        />
        <GpuRow
          label="Memory"
          value={gpu.memoryUsed / GB}
          max={gpu.memoryTotal / GB}
          unit="GB"
          status={getMemoryStatus(gpu.memoryUsed, gpu.memoryTotal)}
          showDetail
        />
        <GpuRow
          label="Power"
          value={gpu.powerUsage}
          max={gpu.powerCapW ?? 1000} // Use power cap if available, fallback 1000W
          unit="W"
          status={
            gpu.powerCapW && gpu.powerUsage > gpu.powerCapW * 0.9
              ? 'danger'
              : gpu.powerCapW && gpu.powerUsage > gpu.powerCapW * 0.7
                ? 'warning'
                : gpu.powerUsage > 800 ? 'danger' : gpu.powerUsage > 600 ? 'warning' : 'normal'
          }
          showDetail
        />
      </div>
    </div>
  );
};

interface GpuRowProps {
  label: string;
  value: number;
  max: number;
  unit: string;
  status: 'normal' | 'warning' | 'danger';
  showDetail?: boolean;
}

const GpuRow: React.FC<GpuRowProps> = ({ label, value, max, unit, status, showDetail }) => (
  <div className="gpu-row">
    <span className="gpu-row-label">{label}</span>
    <div className="gpu-row-bar">
      <GpuBar
        value={value}
        max={max}
        unit={unit}
        status={status}
        showDetail={showDetail}
      />
    </div>
    <span className="gpu-row-value">{formatValue(value, max, unit, showDetail)}</span>
  </div>
);

const GB = 1024 * 1024 * 1024;

export function formatValue(value: number, max: number, unit: string, showDetail?: boolean): string {
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

export function getMemoryStatus(used: number, total: number): 'normal' | 'warning' | 'danger' {
  const ratio = used / total;
  if (ratio > 0.9) {
    return 'danger';
  }
  if (ratio > 0.7) {
    return 'warning';
  }

  return 'normal';
}
