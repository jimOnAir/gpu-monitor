import React, { useState, useEffect, useCallback } from 'react';
import { AgentService, AgentState } from './domains/agents/AgentService';
import { DashboardService } from './domains/dashboard/DashboardService';
import { GpuDetailModal } from './components/GpuDetailModal';
import { GpuCard } from './components/GpuCard';
import { Footer } from './components/Footer';
import { DebugPanel } from './components/DebugPanel';
import { SettingsModal } from './components/SettingsModal';
import { ISettings, DEFAULT_SETTINGS, EAgentStatus } from '@gpu-monitor/shared';
import './styles/main.css';

declare global {
  interface Window {
    electronAPI?: {
      getSettings: () => Promise<ISettings | null>;
      saveSettings: (settings: ISettings) => Promise<boolean>;
      onRefreshAgents: (callback: () => void) => void;
      onOpenSettings: (callback: () => void) => void;
      onWindowClose: () => void;
      updateTrayTemp: (maxTemp: number, warn: number, critical: number) => void;
      updateTrayTooltip: (text: string) => void;
    };
  }
}

const agentService = new AgentService();
const dashboardService = new DashboardService();

export const App: React.FC = () => {
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
    agentId: string;
    agentName: string;
    gpu: import('@gpu-monitor/shared').IGpu;
    index: number;
  } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const handleWindowClose = useCallback(() => {
    if (window.electronAPI?.onWindowClose) {
      window.electronAPI.onWindowClose();
    } else {
      window.close();
    }
  }, []);

  // Load settings from Electron API on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        if (window.electronAPI) {
          const saved = await window.electronAPI.getSettings();
          if (saved) {
            setSettings(saved);
          }
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
      }
    };
    loadSettings();
  }, []);

  // Initialize agent service with settings
  useEffect(() => {
    agentService.initialize(settings);

    const unsubscribe = agentService.subscribe((state) => {
      setAgentState(state);

      // Check for errors
      const offlineAgents = state.agents.filter(
        (a) => a.status === EAgentStatus.Offline && a.lastError
      );
      if (offlineAgents.length > 0) {
        setError(`${offlineAgents.length} agent(s) offline: ${offlineAgents[0].lastError}`);
      } else {
        setError(undefined);
      }
    });

    return () => {
      unsubscribe();
      agentService.stopPolling();
    };
  }, [settings]);

  // Listen for manual refresh from tray
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onRefreshAgents(() => {
        agentService.refreshAll();
      });
      window.electronAPI.onOpenSettings(() => {
        setShowSettings(true);
      });
    }
  }, []);

  // Update tray icon based on max temperature across all GPUs
  useEffect(() => {
    if (!window.electronAPI) return;

    let maxTemp = 0;
    agentState.gpus.forEach((gpus) => {
      gpus.forEach((gpu) => {
        maxTemp = Math.max(maxTemp, gpu.coreTemp, gpu.junctionTemp, gpu.vramTemp);
      });
    });

    if (maxTemp >= 0) {
      window.electronAPI.updateTrayTemp(
        maxTemp,
        settings.thresholds.core.warn,
        settings.thresholds.core.critical,
      );
    }
  }, [agentState.gpus, settings.thresholds.core]);

  // Update tray tooltip with full GPU status
  useEffect(() => {
    if (!window.electronAPI || agentState.gpus.size === 0) return;

    const parts: string[] = [];
    agentState.gpus.forEach((gpus) => {
      gpus.forEach((gpu) => {
        parts.push(
          `${gpu.name} | ${gpu.coreTemp}/${gpu.junctionTemp}/${gpu.vramTemp}C ${gpu.gpuUtilization}% ${Math.round(gpu.powerUsage)}W`,
        );
      });
    });

    const tooltip = parts.join('  ') || 'GPU Monitor';
    window.electronAPI.updateTrayTooltip(tooltip);
  }, [agentState.gpus]);

  // Save settings when they change
  const handleSaveSettings = useCallback(
    async (newSettings: ISettings) => {
      setSettings(newSettings);
      if (window.electronAPI) {
        await window.electronAPI.saveSettings(newSettings);
      }
      agentService.updateSettings(newSettings);
    },
    []
  );

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
  const gpuCount = dashboardService.getGpuCount(agentState);

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
    <div className="app">
      {/* Custom Title Bar */}
      <div className="title-bar">
        <div className="title-bar-text">GPU Monitor</div>
        <div className="title-bar-controls">
          <button className="control-btn" onClick={() => setShowDebug(!showDebug)} title="Debug">
            {showDebug ? 'X' : 'K'}
          </button>
          <button className="control-btn" onClick={() => setShowSettings(true)} title="Settings">
            S
          </button>
          <button className="control-btn control-btn-close" onClick={handleWindowClose} title="Close">
            X
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

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        onSave={handleSaveSettings}
      />

      {/* GPU Detail Modal */}
      {selectedGpu && (() => {
        const currentGpus = agentState.gpus.get(selectedGpu.agentId);
        const currentGpu = currentGpus?.[selectedGpu.index];
        if (!currentGpu) return null;
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
        onToggle={() => setShowDebug(false)}
      />
    </div>
  );
};

interface AgentSectionProps {
  agentId: string;
  gpuData: Array<{ gpu: import('@gpu-monitor/shared').IGpu; agentName: string }>;
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
          onClick={() => onGpuClick(agentId, gpuData[0].agentName, gpu, gpu.index)}
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


