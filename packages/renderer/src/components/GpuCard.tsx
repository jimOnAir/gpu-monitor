import { evaluateStatus, type IGpu, type IGpuAverages, type ISettings, type MetricStatus } from '@gpu-monitor/shared';
import React from 'react';

import { getGpuUtilizationStatus, getMemoryStatus, getPowerStatus, GB } from '../utils/constants';
import { avgDisplay, type AvgDisplay } from '../utils/metricAverages';
import { formatValue } from '../utils/statusDisplay';

import { GpuBar } from './GpuBar';

interface GpuCardProps {
  gpu: IGpu;
  index: number;
  averages?: IGpuAverages;
  settings: ISettings;
  onClick?: () => void;
}

export const GpuCard: React.FC<GpuCardProps> = ({ gpu, index, averages, settings, onClick }) => {
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
        <GpuRow label="Core" value={gpu.coreTemp} max={100} unit="°C" status={evaluateStatus(gpu.coreTemp, settings.thresholds.core.warn, settings.thresholds.core.critical)} avg={avgDisplay(averages?.coreTemp, { unit: '°C' })} />
        <GpuRow label="Junction" value={gpu.junctionTemp} max={100} unit="°C" status={evaluateStatus(gpu.junctionTemp, settings.thresholds.junction.warn, settings.thresholds.junction.critical)} avg={avgDisplay(averages?.junctionTemp, { unit: '°C' })} />
        <GpuRow label="VRAM" value={gpu.vramTemp} max={100} unit="°C" status={evaluateStatus(gpu.vramTemp, settings.thresholds.vram.warn, settings.thresholds.vram.critical)} avg={avgDisplay(averages?.vramTemp, { unit: '°C' })} />
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
          avg={avgDisplay(averages?.gpuUtilization, { unit: '%' })}
        />
        <GpuRow
          label="Memory"
          value={gpu.memoryUsed / GB}
          max={gpu.memoryTotal / GB}
          unit="GB"
          status={getMemoryStatus(gpu.memoryUsed, gpu.memoryTotal)}
          showDetail
          avg={avgDisplay(averages?.memoryUsed, { unit: 'GB', decimals: 1, scale: 1 / GB })}
        />
        <GpuRow
          label="Power"
          value={gpu.powerUsage}
          max={gpu.powerCapW ?? 1000} // Use power cap if available, fallback 1000W
          unit="W"
          status={getPowerStatus(gpu.powerUsage, gpu.powerCapW)}
          showDetail
          avg={avgDisplay(averages?.powerUsage, { unit: 'W' })}
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
  /** Rolling 1/5/10-min averages micro-line shown under the current value. */
  avg?: AvgDisplay | null;
}

const GpuRow: React.FC<GpuRowProps> = ({ label, value, max, unit, status, showDetail, avg }) => (
  <div className="gpu-row">
    <span className="gpu-row-label">{label}</span>
    <div className="gpu-row-bar">
      <GpuBar
        value={value}
        max={max}
        status={status}
      />
    </div>
    <div className="gpu-row-value">
      <span>{formatValue(value, max, unit, showDetail)}</span>
      {avg ? <span className="gpu-row-avg" title={avg.tooltip}>{avg.line}</span> : null}
    </div>
  </div>
);
