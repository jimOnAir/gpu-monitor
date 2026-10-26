import { DEFAULT_SETTINGS, EAgentStatus } from '@gpu-monitor/shared';
import type { GpuDataPayload, IAgent, ISettings } from '@gpu-monitor/shared';
import React, { useState, useEffect, useCallback } from 'react';

import { DebugPanel } from './components/DebugPanel';
import { Footer } from './components/Footer';
import { GpuCard } from './components/GpuCard';
import { GpuDetailModal } from './components/GpuDetailModal';
import { UpdateBanner } from './components/UpdateBanner';
import { getDriverVersion, getGpusByAgent, getLastUpdateTime, getUnreachableAgents } from './domains/dashboard/DashboardService';
import type { AgentState } from './types/AgentState';
import { getAgentStatusLabel } from './utils/statusDisplay';
import { useSettings } from './utils/useSettings';
import { useWindowFocus } from './utils/useWindowFocus';
import './styles/main.css';

// ---------- App ----------

export const App: React.FC = () => {
  const isFocused = useWindowFocus();
  const [loadedSettings] = useSettings();
  const [settings, setSettings] = useState<ISettings>(DEFAULT_SETTINGS);

  // Sync loaded settings into component state
  useEffect(() => {
    if (loadedSettings) {
      setSettings(loadedSettings);
    }
  }, [loadedSettings]);
  const [agentState, setAgentState] = useState<AgentState>({
    agents: [],
    gpus: new Map(),
    lastUpdate: new Map(),
    fetchResult: new Map(),
    lastFetchTimestamp: new Map(),
    statusChangedAt: new Map(),
    averages: new Map(),
  });
  const [selectedGpu, setSelectedGpu] = useState<{
    agentId: string,
    agentName: string,
    gpu: import('@gpu-monitor/shared').IGpu,
    index: number,
  } | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  // Listen for GPU data updates from main process
  useEffect(() => {
    if (window.electronAPI?.onGpuDataUpdate) {
      const cleanup = window.electronAPI.onGpuDataUpdate((payload: GpuDataPayload) => {
        const gpus = new Map<string, Array<import('@gpu-monitor/shared').IGpu>>();
        for (const { agentId, gpus: gpuList } of payload.gpus) {
          gpus.set(agentId, gpuList);
        }
        setAgentState({
          agents: payload.agents,
          gpus,
          lastUpdate: new Map(payload.lastUpdate),
          lastFetchTimestamp: new Map(payload.lastFetchTimestamp),
          statusChangedAt: new Map(payload.statusChangedAt),
          fetchResult: new Map(payload.fetchResult),
          averages: new Map(payload.averages.map((a) => [a.agentId, a.gpus])),
        });
      });

      return cleanup;
    }
  }, []);

  // Handle GPU card click
  const handleGpuClick = useCallback((agentId: string, agentName: string, gpu: import('@gpu-monitor/shared').IGpu, index: number) => {
    setSelectedGpu({ agentId, agentName, gpu, index });
  }, []);

  const handleCloseGpuDetail = useCallback(() => {
    setSelectedGpu(null);
  }, []);

  // Prepare data for rendering
  const gpusByAgent = getGpusByAgent(agentState);
  const unreachableAgents = getUnreachableAgents(agentState);
  const lastUpdate = getLastUpdateTime(agentState);

  // Driver version (all GPUs on one machine share the same driver)
  const driverVersion = getDriverVersion(agentState);

  return (
    <div className={`app${!isFocused ? ' unfocused' : ''}`}>
      {/* Custom Title Bar */}
      <div className="title-bar">
        <div className="title-bar-text">
          <svg className="title-bar-icon" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d="M2.2 11.5a6.2 6.2 0 1 1 11.6 0" />
            <line x1="8" y1="11" x2="11" y2="6.5" />
            <circle cx="8" cy="11" r="1" fill="currentColor" stroke="none" />
          </svg>
          GPU Monitor
        </div>
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
                  averages={agentState.averages.get(agentId)}
                  settings={settings}
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

      {/* Update banner */}
      <UpdateBanner visible={isFocused} />

      {/* Footer */}
      <Footer
        refreshInterval={settings.refreshInterval}
        lastUpdate={lastUpdate}
      />

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
            averages={agentState.averages.get(selectedGpu.agentId)?.[selectedGpu.index]}
            settings={settings}
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
  agent: IAgent | undefined;
  averages?: Array<import('@gpu-monitor/shared').IGpuAverages>;
  settings: ISettings;
  onGpuClick: (agentId: string, agentName: string, gpu: import('@gpu-monitor/shared').IGpu, index: number) => void;
}

export const AgentSection: React.FC<AgentSectionProps> = ({ agentId, gpuData, agent, averages, settings, onGpuClick }) => (
  <div className="agent-section">
    <div className="agent-section-header">
      <h3>{gpuData[0].agentName}</h3>
      <span className="agent-endpoint">{agent?.url || ''}</span>
      <span className={`agent-status-badge ${agent?.status || ''}`}>
        {getAgentStatusLabel(agent?.status)}
      </span>
    </div>
    <div className="gpu-grid">
      {gpuData.map(({ gpu }, i) => (
        <GpuCard
          key={`${agentId}-gpu-${gpu.index}`}
          gpu={gpu}
          index={gpu.index}
          averages={averages?.[i]}
          settings={settings}
          onClick={() => {
            onGpuClick(agentId, gpuData[0].agentName, gpu, gpu.index);
          }}
        />
      ))}
    </div>
  </div>
);

interface UnreachableAgentProps {
  agent: IAgent;
  onGpuClick: (agentId: string, agentName: string, gpu: import('@gpu-monitor/shared').IGpu, index: number) => void;
}

export const UnreachableAgent: React.FC<UnreachableAgentProps> = ({ agent }) => (
  <div className="agent-section agent-section-unreachable">
    <div className="agent-section-header">
      <h3>{agent.name}</h3>
      <span className="agent-endpoint">{agent.url}</span>
      <span className={`agent-status-badge ${agent.status}`}>
        {getAgentStatusLabel(agent.status)}
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
