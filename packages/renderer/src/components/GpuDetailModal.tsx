import { evaluateStatus, type EAgentStatus, type IGpu, type IGpuAverages, type ISettings, type MetricStatus } from '@gpu-monitor/shared';
import React from 'react';

import { GB, getGpuUtilizationStatus, getMemoryStatus, getPowerStatus } from '../utils/constants';
import { avgDisplay, type AvgDisplay } from '../utils/metricAverages';
import { getAgentStatusLabel } from '../utils/statusDisplay';

import { GpuBar } from './GpuBar';

interface GpuDetailModalProps {
  gpu: IGpu;
  gpuIndex: number;
  agentName: string;
  agentStatus: EAgentStatus;
  driverVersion?: string;
  averages?: IGpuAverages;
  settings: ISettings;
  onClose: () => void;
}

interface GpuSectionProps {
  title: string;
  children: React.ReactNode;
}

const GpuSection: React.FC<GpuSectionProps> = ({ title, children }) => (
  <div className="detail-section">
    <div className="detail-section-title">{title}</div>
    <div className="detail-section-body">{children}</div>
  </div>
);

interface MetricRowProps {
  label: string;
  value: string;
  status?: MetricStatus;
  hint?: string;
}

const MetricRow: React.FC<MetricRowProps> = ({ label, value, status, hint }) => (
  <div className={`detail-metric ${status || ''}`}>
    <div className="detail-metric-label">{label}</div>
    <div className="detail-metric-value">{value}</div>
    {hint && <div className="detail-metric-hint">{hint}</div>}
  </div>
);

interface MetricBarProps {
  label: string;
  value: number;
  max: number;
  unit: string;
  status: MetricStatus;
  hint?: string;
  /** Rolling 1/5/10-min averages micro-line shown under the current value. */
  avg?: AvgDisplay | null;
}

const MetricBar: React.FC<MetricBarProps> = ({ label, value, max, unit, status, hint, avg }) => (
  <div className="detail-metric-bar">
    <div className="detail-metric-bar-header">
      <span className="detail-metric-bar-label">{label}</span>
      <div className="detail-metric-bar-value-col">
        <span className="detail-metric-bar-value">
          {value.toFixed(0)}{unit}
        </span>
        {avg ? <span className="detail-metric-avg" title={avg.tooltip}>{avg.line}</span> : null}
      </div>
    </div>
    <GpuBar value={value} max={max} status={status} />
    {hint && <div className="detail-metric-bar-hint">{hint}</div>}
  </div>
);

interface TempRowProps {
  label: string;
  /** null = sensor unavailable */
  value: number | null;
  status: MetricStatus;
  shutdown?: number;
  slowdown?: number;
  /** Rolling 1/5/10-min averages micro-line shown under the current value. */
  avg?: AvgDisplay | null;
}

const TempRow: React.FC<TempRowProps> = ({ label, value, status, shutdown, slowdown, avg }) => (
  <div className="detail-temp-row">
    <span className="detail-temp-label">{label}</span>
    <div className="detail-temp-bar-wrap">
      <GpuBar value={value} max={Math.max(shutdown || 110, (value ?? 0) * 1.2)} status={status} animated />
    </div>
    <div className="detail-temp-value">
      <span>{value === null ? '--' : `${value.toFixed(0)}°C`}</span>
      {avg ? <span className="detail-metric-avg" title={avg.tooltip}>{avg.line}</span> : null}
    </div>
    {(shutdown !== undefined || slowdown !== undefined) && (
      <div className="detail-temp-thresholds">
        {slowdown !== undefined && <span>SL: {slowdown}°C</span>}
        {shutdown !== undefined && <span>SH: {shutdown}°C</span>}
      </div>
    )}
  </div>
);

export const GpuDetailModal: React.FC<GpuDetailModalProps> = ({
  gpu,
  gpuIndex,
  agentName,
  agentStatus,
  driverVersion,
  averages,
  settings,
  onClose,
}) => {
  const handleBackdropClick = (e?: React.MouseEvent) => {
    if (!e || e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={handleBackdropClick}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          handleBackdropClick();
        }
      }}
      role="dialog"
      aria-label={`GPU ${gpuIndex} detail`}
      tabIndex={-1}
    >
      <div className="modal-container modal-container-detail">
        {/* Header */}
        <div className="detail-header">
          <div className="detail-header-info">
            <h2 className="detail-header-name">GPU {gpuIndex}: {gpu.name}</h2>
            <div className="detail-header-meta">
              <span className={`agent-status-badge ${agentStatus}`}>
                {getAgentStatusLabel(agentStatus)}
              </span>
              <span className="detail-agent-source">{agentName}</span>
              {driverVersion && (
                <span className="detail-driver">Driver: {driverVersion}</span>
              )}
              {gpu.perfState !== undefined && gpu.perfState !== null && (
                <span className="detail-pstate">
                  P-State: {getPerfStateLabel(gpu.perfState)}
                </span>
              )}
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="detail-body">
          <div className="detail-gpu-card">
            {/* GPU Identity */}
            <div className="detail-gpu-header">
              <div className="detail-gpu-identity">
                <div className="detail-gpu-title">
                  <span className="detail-gpu-index">GPU {gpu.index}</span>
                  <span className="detail-gpu-name">{gpu.name}</span>
                </div>
                <div className="detail-gpu-manufacturer">
                  {gpu.vendor && (
                    <span className="detail-gpu-vendor-label">
                      Manufacturer: <span className="detail-gpu-vendor">{gpu.vendor}</span>
                    </span>
                  )}
                  {gpu.model && (
                    <span className="detail-gpu-model-label">
                      Model: <span className="detail-gpu-model">{gpu.model}</span>
                    </span>
                  )}
                  {gpu.partNumber && (
                    <span className="detail-gpu-pn-label">
                      Part #: <span className="detail-gpu-part-number">{gpu.partNumber}</span>
                    </span>
                  )}
                </div>
              </div>
              <div className="detail-gpu-uuid" title={gpu.uuid}>{gpu.uuid}</div>
            </div>

            {/* Temperatures */}
            <GpuSection title="Temperatures">
              <div className="detail-temp-grid">
                <TempRow
                  label="Core"
                  value={gpu.coreTemp}
                  status={evaluateStatus(gpu.coreTemp, settings.thresholds.core.warn, settings.thresholds.core.critical)}
                  shutdown={gpu.tempShutdown}
                  slowdown={gpu.tempSlowdown}
                  avg={avgDisplay(averages?.coreTemp, { unit: '°C' })}
                />
                <TempRow
                  label="Junction"
                  value={gpu.junctionTemp}
                  status={evaluateStatus(gpu.junctionTemp, settings.thresholds.junction.warn, settings.thresholds.junction.critical)}
                  shutdown={gpu.tempShutdown}
                  slowdown={gpu.tempSlowdown}
                  avg={avgDisplay(averages?.junctionTemp, { unit: '°C' })}
                />
                <TempRow
                  label="VRAM"
                  value={gpu.vramTemp}
                  status={evaluateStatus(gpu.vramTemp, settings.thresholds.vram.warn, settings.thresholds.vram.critical)}
                  shutdown={gpu.tempShutdown}
                  slowdown={gpu.tempSlowdown}
                  avg={avgDisplay(averages?.vramTemp, { unit: '°C' })}
                />
              </div>
            </GpuSection>

            {/* Performance */}
            <GpuSection title="Performance">
              <div className="detail-perf-grid">
                <MetricBar
                  label="Fan"
                  value={gpu.fanSpeed || 0}
                  max={100}
                  unit="%"
                  status="normal"
                  avg={gpu.fanSpeed !== undefined ? avgDisplay(averages?.fanSpeed, { unit: '%' }) : null}
                />
                <MetricBar
                  label="GPU Clock"
                  value={gpu.gpuClockMHz || 0}
                  max={Math.max((gpu.gpuClockMHz || 1) * 1.3, 2000)}
                  unit=" MHz"
                  status="normal"
                  avg={gpu.gpuClockMHz !== undefined ? avgDisplay(averages?.gpuClockMHz, { unit: 'MHz' }) : null}
                />
                <MetricBar
                  label="Memory Clock"
                  value={gpu.memClockMHz || 0}
                  max={Math.max((gpu.memClockMHz || 1) * 1.3, 2000)}
                  unit=" MHz"
                  status="normal"
                  avg={gpu.memClockMHz !== undefined ? avgDisplay(averages?.memClockMHz, { unit: 'MHz' }) : null}
                />
                <MetricRow
                  label="P-State"
                  value={getPerfStateLabel(gpu.perfState)}
                  status={gpu.perfState === 0 ? 'warning' : 'normal'}
                  hint="P0 = maximum performance"
                />
              </div>
            </GpuSection>

            {/* Utilization */}
            <GpuSection title="Utilization">
              <div className="detail-util-grid">
                <MetricBar
                  label="GPU"
                  value={gpu.gpuUtilization}
                  max={100}
                  unit="%"
                  status={getGpuUtilizationStatus(gpu.gpuUtilization)}
                  avg={avgDisplay(averages?.gpuUtilization, { unit: '%' })}
                />
                <MetricBar
                  label="Memory Used"
                  value={gpu.memoryUsed / GB}
                  max={gpu.memoryTotal / GB}
                  unit=" GB"
                  status={getMemoryStatus(gpu.memoryUsed, gpu.memoryTotal)}
                  hint={`${((gpu.memoryUsed / gpu.memoryTotal) * 100).toFixed(1)}% of ${(gpu.memoryTotal / GB).toFixed(1)} GB`}
                  avg={avgDisplay(averages?.memoryUsed, { unit: 'GB', decimals: 1, scale: 1 / GB })}
                />
              </div>
            </GpuSection>

            {/* Power */}
            <GpuSection title="Power">
              <div className="detail-power-grid">
                <MetricBar
                  label="Power Usage"
                  value={gpu.powerUsage}
                  max={gpu.powerCapW || 400}
                  unit=" W"
                  status={getPowerStatus(gpu.powerUsage, gpu.powerCapW)}
                  hint={gpu.powerCapW ? `Cap: ${gpu.powerCapW.toFixed(0)}W` : undefined}
                  avg={avgDisplay(averages?.powerUsage, { unit: 'W' })}
                />
              </div>
            </GpuSection>
          </div>
        </div>
      </div>
    </div>
  );
};

export function getPerfStateLabel(pstate: number | undefined): string {
  if (pstate === undefined) {
    return 'N/A';
  }
  if (pstate === 0) {
    return 'P0 (Max)';
  }
  if (pstate <= 3) {
    return `P${pstate} (High)`;
  }
  if (pstate <= 6) {
    return `P${pstate} (Mid)`;
  }

  return `P${pstate} (Low)`;
}
