import { DEFAULT_SETTINGS, EAgentStatus } from '@gpu-monitor/shared';
import type { ISettings } from '@gpu-monitor/shared';
import type { GpuDataPayload } from '@gpu-monitor/shared';
import React, { useState, useEffect, useCallback } from 'react';

import { DebugPanel } from './components/DebugPanel';
import { Footer } from './components/Footer';
import { GpuCard } from './components/GpuCard';
import { GpuDetailModal } from './components/GpuDetailModal';
import { DashboardService } from './domains/dashboard/DashboardService';
import type { AgentState } from './types/AgentState';
import { useWindowFocus } from './utils/useWindowFocus';
import './styles/main.css';

// ---------- Services ----------

const dashboardService = new DashboardService();

/** Rebuild AgentState from IPC payload. */
function buildAgentState(payload: GpuDataPayload): AgentState {
  const gpus = new Map<string, Array<import('@gpu-monitor/shared').IGpu>>();
  for (const { agentId, gpus: gpuList } of payload.gpus) {
    gpus.set(agentId, gpuList);
  }

  return {
    agents: payload.agents,
    gpus,
    lastUpdate: new Map(payload.lastUpdate),
    lastFetchTimestamp: new Map(payload.lastFetchTimestamp),
    statusChangedAt: new Map(payload.statusChangedAt),
    fetchResult: new Map(payload.fetchResult),
  };
}

// ---------- App ----------

export const App: React.FC = () => {
  const isFocused = useWindowFocus();
  const [settings, setSettings] = useState<ISettings>(DEFAULT_SETTINGS);
  const [agentState, setAgentState] = useState<AgentState>({
    agents: [],
    gpus: new Map(),
    lastUpdate: new Map(),
    fetchResult: new Map(),
    lastFetchTimestamp: new Map(),
    statusChangedAt: new Map(),
  });
  const [selectedGpu, setSelectedGpu] = useState<{
    agentId: string,
    agentName: string,
    gpu: import('@gpu-monitor/shared').IGpu,
    index: number,
  } | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  // Load settings from Electron API on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        if (window.electronAPI) {
          const result = await window.electronAPI.getSettings();
          if (result.success && result.data) {
            setSettings(result.data);
          }
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
      }
    };
    void loadSettings();
  }, []);

  // Listen for GPU data updates from main process
  useEffect(() => {
    if (window.electronAPI?.onGpuDataUpdate) {
      const cleanup = window.electronAPI.onGpuDataUpdate((payload) => {
        setAgentState(buildAgentState(payload));
      });

      return cleanup;
    }
  }, []);

  // Settings now opens in a separate window — no tray menu listener needed

  // Handle GPU card click
  const handleGpuClick = useCallback((agentId: string, agentName: string, gpu: import('@gpu-monitor/shared').IGpu, index: number) => {
    setSelectedGpu({ agentId, agentName, gpu, index });
  }, []);

  const handleCloseGpuDetail = useCallback(() => {
    setSelectedGpu(null);
  }, []);

  // Prepare data for rendering
  const gpusByAgent = dashboardService.getGpusByAgent(agentState);
  const unreachableAgents = dashboardService.getUnreachableAgents(agentState);
  const lastUpdate = dashboardService.getLastUpdateTime(agentState);
  const _gpuCount = dashboardService.getGpuCount(agentState);

  // Driver version (all GPUs on one machine share the same driver)
  const driverVersion = (() => {
    for (const gpus of agentState.gpus.values()) {
      if (gpus.length > 0 && gpus[0].driverVersion) {
        return gpus[0].driverVersion;
      }
    }

    return undefined;
  })();

  return (
    <div className={`app${!isFocused ? ' unfocused' : ''}`}>
      {/* Custom Title Bar */}
      <div className="title-bar">
        { }
        <div className="title-bar-text">🔥 GPU Monitor</div>
        <div className="title-bar-controls">
          <button className="control-btn" onClick={() => {
            setShowDebug(!showDebug);
          }} title="Debug">
            {showDebug ? '✕' : '⌨'}
          </button>
          <button className="control-btn" onClick={() => {
            void window.electronAPI?.openPreferences();
          }} title="Settings">
            ⚙
          </button>
          <button className="control-btn control-btn-close" onClick={() => {
            void window.electronAPI?.onWindowClose();
          }} title="Close">
            ✕
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        <div className="gpu-container">
          {gpusByAgent.size === 0 && unreachableAgents.length === 0 ? (
            <div className="empty-state">
              <p>No GPU data available</p>
              <p className="empty-state-hint">
                Agents are polling... Check settings if agents are offline.
              </p>
            </div>
          ) : (
            <>
              {/* Reachable agents */}
              {Array.from(gpusByAgent.entries()).map(([agentId, gpuData]) => (
                <AgentSection
                  key={agentId}
                  agentId={agentId}
                  gpuData={gpuData}
                  agent={agentState.agents.find((a) => a.id === agentId)}
                  onGpuClick={handleGpuClick}
                />
              ))}

              {/* Unreachable agents */}
              {unreachableAgents.map(({ agent }) => (
                <UnreachableAgent
                  key={agent.id}
                  agent={agent}
                  onGpuClick={handleGpuClick}
                />
              ))}
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <Footer
        refreshInterval={settings.refreshInterval}
        lastUpdate={lastUpdate}
      />

      {/* Settings now opens in a separate window */}

      {/* GPU Detail Modal */}
      {selectedGpu && (() => {
        const currentGpus = agentState.gpus.get(selectedGpu.agentId);
        const currentGpu = currentGpus?.[selectedGpu.index];
        if (!currentGpu) {
          return null;
        }
        const agent = agentState.agents.find((a) => a.id === selectedGpu.agentId);

        return (
          <GpuDetailModal
            gpu={currentGpu}
            gpuIndex={selectedGpu.index}
            agentName={selectedGpu.agentName}
            agentStatus={agent?.status || EAgentStatus.Offline}
            driverVersion={driverVersion}
            onClose={handleCloseGpuDetail}
          />
        );
      })()}

      {/* Debug Panel */}
      <DebugPanel
        agentState={agentState}
        visible={showDebug}
        onToggle={() => {
          setShowDebug(false);
        }}
      />
    </div>
  );
};

interface AgentSectionProps {
  agentId: string;
  gpuData: Array<{ gpu: import('@gpu-monitor/shared').IGpu, agentName: string }>;
  agent: import('@gpu-monitor/shared').IAgent | undefined;
  onGpuClick: (agentId: string, agentName: string, gpu: import('@gpu-monitor/shared').IGpu, index: number) => void;
}

export const AgentSection: React.FC<AgentSectionProps> = ({ agentId, gpuData, agent, onGpuClick }) => (
  <div className="agent-section">
    <div className="agent-section-header">
      <h3>{gpuData[0].agentName}</h3>
      <span className="agent-endpoint">{agent?.url || ''}</span>
      <span className={`agent-status-badge ${agent?.status || ''}`}>
        {getAgentStatusBadge(agent?.status)}
      </span>
    </div>
    <div className="gpu-grid">
      {gpuData.map(({ gpu }) => (
        <GpuCard
          key={`${agentId}-gpu-${gpu.index}`}
          gpu={gpu}
          index={gpu.index}
          agentName={gpuData[0].agentName}
          onClick={() => {
            onGpuClick(agentId, gpuData[0].agentName, gpu, gpu.index);
          }}
        />
      ))}
    </div>
  </div>
);

interface UnreachableAgentProps {
  agent: import('@gpu-monitor/shared').IAgent;
  onGpuClick: (agentId: string, agentName: string, gpu: import('@gpu-monitor/shared').IGpu, index: number) => void;
}

export const UnreachableAgent: React.FC<UnreachableAgentProps> = ({ agent }) => (
  <div className="agent-section agent-section-unreachable">
    <div className="agent-section-header">
      <h3>{agent.name}</h3>
      <span className="agent-endpoint">{agent.url}</span>
      <span className={`agent-status-badge ${agent.status}`}>
        {getAgentStatusBadge(agent.status)}
      </span>
    </div>
    {agent.lastError && (
      <div className="unreachable-error">
        <span className="unreachable-error-icon">!</span>
        {agent.lastError}
      </div>
    )}
  </div>
);

function getAgentStatusBadge(status?: EAgentStatus): string {
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
