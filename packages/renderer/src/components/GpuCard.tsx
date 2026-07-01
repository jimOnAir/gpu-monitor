import React from 'react';
import { IGpu } from '@gpu-monitor/shared';
import { GpuBar } from './GpuBar';

interface GpuCardProps {
  gpu: IGpu;
  index: number;
  agentName: string;
}

export const GpuCard: React.FC<GpuCardProps> = ({ gpu, index, agentName }) => {
  return (
    <div className="gpu-card" role="region" aria-label={`GPU ${index}: ${gpu.name}`}>
      {/* Header */}
      <div className="gpu-card-header">
        <span className="gpu-card-index">GPU {index}</span>
        <span className="gpu-card-name" title={gpu.name}>
          {gpu.name}
        </span>
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
          value={gpu.memoryUsed}
          max={gpu.memoryTotal}
          unit="B"
          status={getMemoryStatus(gpu.memoryUsed, gpu.memoryTotal)}
          showDetail
        />
        <GpuRow
          label="Power"
          value={gpu.powerUsage / 1000} // Convert milliwatts to watts
          max={1000} // Assume 1000W max for bar visualization
          unit="W"
          status={gpu.powerUsage > 800000 ? 'danger' : gpu.powerUsage > 600000 ? 'warning' : 'normal'}
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

function formatValue(value: number, max: number, unit: string, showDetail?: boolean): string {
  if (showDetail) {
    return `${(value / GB).toFixed(1)}/${(max / GB).toFixed(1)}GB`;
  }
  if (unit === 'W') {
    return `${value.toFixed(0)}W`;
  }
  if (unit === 'B') {
    return `${(value / GB).toFixed(0)}GB`;
  }
  return `${Math.round(value)}${unit}`;
}

function getMemoryStatus(used: number, total: number): 'normal' | 'warning' | 'danger' {
  const ratio = used / total;
  if (ratio > 0.9) return 'danger';
  if (ratio > 0.7) return 'warning';
  return 'normal';
}
