import React from 'react';
import { IGpu, IAgent, EAgentStatus } from '@gpu-monitor/shared';
import { GpuBar } from './GpuBar';
import { AgentState } from '../domains/agents/AgentService';

interface AgentDetailModalProps {
  agentId: string;
  agentState: AgentState;
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
  status?: 'normal' | 'warning' | 'danger';
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
  status: 'normal' | 'warning' | 'danger';
  hint?: string;
}

const MetricBar: React.FC<MetricBarProps> = ({ label, value, max, unit, status, hint }) => {
  const percentage = Math.min((value / max) * 100, 100);
  return (
    <div className="detail-metric-bar">
      <div className="detail-metric-bar-header">
        <span className="detail-metric-bar-label">{label}</span>
        <span className="detail-metric-bar-value">
          {value.toFixed(0)}{unit}
        </span>
      </div>
      <div className="detail-metric-bar-track">
        <div
          className="detail-metric-bar-fill"
          style={{
            width: `${percentage}%`,
            backgroundColor: getStatusColor(status),
          }}
        />
      </div>
      {hint && <div className="detail-metric-bar-hint">{hint}</div>}
    </div>
  );
};

interface TempRowProps {
  label: string;
  value: number;
  status: 'normal' | 'warning' | 'danger';
  shutdown?: number;
  slowdown?: number;
}

const TempRow: React.FC<TempRowProps> = ({ label, value, status, shutdown, slowdown }) => (
  <div className="detail-temp-row">
    <span className="detail-temp-label">{label}</span>
    <div className="detail-temp-bar-wrap">
      <GpuBar value={value} max={Math.max(shutdown || 110, value * 1.2)} unit="°C" status={status} animated />
    </div>
    <span className="detail-temp-value">{value.toFixed(0)}°C</span>
    {(shutdown !== undefined || slowdown !== undefined) && (
      <div className="detail-temp-thresholds">
        {slowdown !== undefined && <span>SL: {slowdown}°C</span>}
        {shutdown !== undefined && <span>SH: {shutdown}°C</span>}
      </div>
    )}
  </div>
);

interface ExtendedGpu extends IGpu {
  agentName: string;
  agentStatus: EAgentStatus;
}

export const AgentDetailModal: React.FC<AgentDetailModalProps> = ({ agentId, agentState, onClose }) => {
  const agent = agentState.agents.find((a) => a.id === agentId);
  const gpus = agentState.gpus.get(agentId) || [];

  if (!agent) return null;

  /* Driver version is on the GPU (all GPUs on one machine share the same driver) */
  const driverVersion = gpus.length > 0 ? gpus[0].driverVersion : undefined;
  /* P-state from the first GPU that has it */
  const firstPState = gpus.find((g) => g.perfState !== undefined)?.perfState;

  const extendedGpus: ExtendedGpu[] = gpus.map((gpu) => ({
    ...gpu,
    agentName: agent.name,
    agentStatus: agent.status,
  }));

  const getStatusLabel = (status: EAgentStatus): string => {
    switch (status) {
      case EAgentStatus.Online:
        return 'Online';
      case EAgentStatus.Offline:
        return 'Offline';
      case EAgentStatus.Stale:
        return 'Stale';
      default:
        return 'Unknown';
    }
  };

  const getPerfStateLabel = (pstate: number | undefined): string => {
    if (pstate === undefined || pstate === null) return 'N/A';
    if (pstate === 0) return 'P0 (Max)';
    if (pstate <= 3) return `P${pstate} (High)`;
    if (pstate <= 6) return `P${pstate} (Mid)`;
    return `P${pstate} (Low)`;
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick} role="dialog" aria-label="Agent detail">
      <div className="modal-container modal-container-detail">
        {/* Header */}
        <div className="detail-header">
          <div className="detail-header-info">
            <h2 className="detail-header-name">{agent.name}</h2>
            <div className="detail-header-meta">
              <span className={`agent-status-badge ${agent.status}`}>
                {getStatusLabel(agent.status)}
              </span>
              {driverVersion && (
                <span className="detail-driver">Driver: {driverVersion}</span>
              )}
              {firstPState !== undefined && firstPState !== null && (
                <span className="detail-pstate">
                  P-State: {getPerfStateLabel(firstPState)}
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
          {extendedGpus.map((gpu) => (
            <div key={`${agentId}-gpu-${gpu.index}`} className="detail-gpu-card">
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
                    status={gpu.coreStatus}
                    shutdown={gpu.tempShutdown}
                    slowdown={gpu.tempSlowdown}
                  />
                  <TempRow
                    label="Junction"
                    value={gpu.junctionTemp}
                    status={gpu.junctionStatus}
                    shutdown={gpu.tempShutdown}
                    slowdown={gpu.tempSlowdown}
                  />
                  <TempRow
                    label="VRAM"
                    value={gpu.vramTemp}
                    status={gpu.vramStatus}
                    shutdown={gpu.tempShutdown}
                    slowdown={gpu.tempSlowdown}
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
                  />
                  <MetricBar
                    label="GPU Clock"
                    value={gpu.gpuClockMHz || 0}
                    max={Math.max((gpu.gpuClockMHz || 1) * 1.3, 2000)}
                    unit=" MHz"
                    status="normal"
                  />
                  <MetricBar
                    label="Memory Clock"
                    value={gpu.memClockMHz || 0}
                    max={Math.max((gpu.memClockMHz || 1) * 1.3, 2000)}
                    unit=" MHz"
                    status="normal"
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
                    status={
                      gpu.gpuUtilization > 90
                        ? 'danger'
                        : gpu.gpuUtilization > 70
                        ? 'warning'
                        : 'normal'
                    }
                  />
                  <MetricBar
                    label="Memory Used"
                    value={gpu.memoryUsed / (1024 * 1024 * 1024)}
                    max={gpu.memoryTotal / (1024 * 1024 * 1024)}
                    unit=" GB"
                    status={
                      gpu.memoryUsed / gpu.memoryTotal > 0.9
                        ? 'danger'
                        : gpu.memoryUsed / gpu.memoryTotal > 0.7
                        ? 'warning'
                        : 'normal'
                    }
                    hint={`${((gpu.memoryUsed / gpu.memoryTotal) * 100).toFixed(1)}% of ${(gpu.memoryTotal / (1024 * 1024 * 1024)).toFixed(1)} GB`}
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
                    status={
                      gpu.powerCapW && gpu.powerUsage > gpu.powerCapW * 0.9
                        ? 'danger'
                        : gpu.powerCapW && gpu.powerUsage > gpu.powerCapW * 0.7
                        ? 'warning'
                        : 'normal'
                    }
                    hint={gpu.powerCapW ? `Cap: ${gpu.powerCapW.toFixed(0)}W` : undefined}
                  />
                </div>
              </GpuSection>
            </div>
          ))}
        </div>
      </div>
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
