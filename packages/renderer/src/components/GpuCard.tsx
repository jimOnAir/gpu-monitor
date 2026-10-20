import { evaluateStatus, type IGpu, type ISettings, type MetricStatus } from '@gpu-monitor/shared';
import React from 'react';

import { getGpuUtilizationStatus, getMemoryStatus, getPowerStatus, GB } from '../utils/constants';
import { formatValue } from '../utils/statusDisplay';

import { GpuBar } from './GpuBar';

interface GpuCardProps {
  gpu: IGpu;
  index: number;
  settings: ISettings;
  onClick?: () => void;
}

export const GpuCard: React.FC<GpuCardProps> = ({ gpu, index, settings, onClick }) => {
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
        <GpuRow label="Core" value={gpu.coreTemp} max={100} unit="°C" status={evaluateStatus(gpu.coreTemp, settings.thresholds.core.warn, settings.thresholds.core.critical)} />
        <GpuRow label="Junction" value={gpu.junctionTemp} max={100} unit="°C" status={evaluateStatus(gpu.junctionTemp, settings.thresholds.junction.warn, settings.thresholds.junction.critical)} />
        <GpuRow label="VRAM" value={gpu.vramTemp} max={100} unit="°C" status={evaluateStatus(gpu.vramTemp, settings.thresholds.vram.warn, settings.thresholds.vram.critical)} />
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
          status={getGpuUtilizationStatus(gpu.gpuUtilization)}
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
          status={getPowerStatus(gpu.powerUsage, gpu.powerCapW)}
          showDetail
        />
      </div>
    </div>
  );
};

interface GpuRowProps {
  label: string;
  /** null = sensor unavailable */
  value: number | null;
  max: number;
  unit: string;
  status: MetricStatus;
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
