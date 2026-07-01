import React, { useState, useEffect, useCallback } from 'react';
import { AgentService, AgentState } from './domains/agents/AgentService';
import { DashboardService } from './domains/dashboard/DashboardService';
import { AgentList } from './components/AgentList';
import { AgentDetailModal } from './components/AgentDetailModal';
import { GpuCard } from './components/GpuCard';
import { Footer } from './components/Footer';
import { SettingsModal } from './components/SettingsModal';
import { DebugPanel } from './components/DebugPanel';
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
  const [detailAgentId, setDetailAgentId] = useState<string | null>(null);
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

    if (maxTemp > 0) {
      window.electronAPI.updateTrayTemp(
        maxTemp,
        settings.thresholds.core.warn,
        settings.thresholds.core.critical,
      );
    }
  }, [agentState.gpus, settings.thresholds.core]);

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

  // Prepare data for rendering
  const gpusByAgent = dashboardService.getGpusByAgent(agentState);
  const lastUpdate = dashboardService.getLastUpdateTime(agentState);
  const gpuCount = dashboardService.getGpuCount(agentState);

  return (
    <div className="app">
      {/* Custom Title Bar */}
      <div className="title-bar">
        <div className="title-bar-text">🔥 GPU Monitor</div>
        <div className="title-bar-controls">
          <button className="control-btn" onClick={() => setShowDebug(!showDebug)} title="Debug">
            {showDebug ? '✕' : '⌨'}
          </button>
          <button className="control-btn" onClick={() => setShowSettings(true)} title="Settings">
            ⚙
          </button>
          <button className="control-btn control-btn-close" onClick={handleWindowClose} title="Close">
            ✕
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        <AgentList
          agents={agentState.agents}
          selectedAgent={detailAgentId}
          onSelectAgent={setDetailAgentId}
        />

        <div className="gpu-container">
          {gpusByAgent.size === 0 ? (
            <div className="empty-state">
              <p>No GPU data available</p>
              <p className="empty-state-hint">
                Agents are polling... Check settings if agents are offline.
              </p>
            </div>
          ) : (
            Array.from(gpusByAgent.entries()).map(([agentId, gpuData]) => (
              <div key={agentId} className="agent-section">
                <div className="agent-section-header">
                  <h3>{gpuData[0].agentName}</h3>
                  <span className={`agent-status-badge ${agentState.agents.find((a) => a.id === agentId)?.status || ''}`}>
                    {getAgentStatusBadge(agentState.agents.find((a) => a.id === agentId)?.status)}
                  </span>
                </div>
                <div className="gpu-grid">
                  {gpuData.map(({ gpu }, idx) => (
                    <GpuCard
                      key={`${agentId}-gpu-${gpu.index}`}
                      gpu={gpu}
                      index={gpu.index}
                      agentName={gpuData[0].agentName}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Footer */}
      <Footer
        agentState={agentState}
        refreshInterval={settings.refreshInterval}
        error={error}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        onSave={handleSaveSettings}
      />

      {/* Agent Detail Modal */}
      {detailAgentId && (
        <AgentDetailModal
          agentId={detailAgentId}
          agentState={agentState}
          onClose={() => setDetailAgentId(null)}
        />
      )}

      {/* Debug Panel */}
      <DebugPanel
        agentState={agentState}
        visible={showDebug}
        onToggle={() => setShowDebug(false)}
      />
    </div>
  );
};

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

export default App;
