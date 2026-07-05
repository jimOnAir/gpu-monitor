import React from 'react';

import type { AgentState, FetchResult } from '../types/AgentState';

interface DebugPanelProps {
  agentState: AgentState;
  visible: boolean;
  onToggle: () => void;
}

const FETCH_RESULT_LABELS: Record<FetchResult, string> = {
  'pending': 'POLLED',
  'ok': 'OK',
  'fetch-failed': 'FETCH FAIL',
  'health-failed': 'HEALTH FAIL',
  'error': 'ERROR',
};

const FETCH_RESULT_COLORS: Record<FetchResult, string> = {
  'pending': '#FFC107',
  'ok': '#4CAF50',
  'fetch-failed': '#F44336',
  'health-failed': '#FF9800',
  'error': '#F44336',
};

export const DebugPanel: React.FC<DebugPanelProps> = ({ agentState, visible, onToggle }) => {
  if (!visible) {
    return null;
  }

  const now = Date.now();

  return (
    <div className="debug-panel">
      <div className="debug-panel-header">
        <span className="debug-panel-title">Debug</span>
        <button className="debug-panel-close" onClick={onToggle}>&times;</button>
      </div>
      <div className="debug-panel-body">
        {/* Agent Status */}
        {agentState.agents.map((agent) => {
          const gpus = agentState.gpus.get(agent.id) || [];
          const lastUpdate = agentState.lastUpdate.get(agent.id);
          const lastFetchTs = agentState.lastFetchTimestamp.get(agent.id);
          const ageSec = lastUpdate ? Math.floor((now - lastUpdate) / 1000) : null;
          const fetchAgeSec = lastFetchTs ? Math.floor((now - lastFetchTs) / 1000) : null;
          const fetchResult = agentState.fetchResult.get(agent.id) || 'pending';

          return (
            <div key={agent.id} className="debug-agent">
              <div className="debug-agent-header">
                <span className={`debug-agent-status ${agent.status ?? 'unknown'}`}>
                  {(agent.status ?? 'unknown').toUpperCase()}
                </span>
                <span className="debug-agent-name">{agent.name}</span>
                <span
                  className="debug-fetch-result"
                  style={{ backgroundColor: FETCH_RESULT_COLORS[fetchResult] }}
                >
                  {FETCH_RESULT_LABELS[fetchResult]}
                </span>
              </div>
              <div className="debug-agent-row">
                <span className="debug-label">URL</span>
                <span className="debug-value">{agent.url}</span>
              </div>
              <div className="debug-agent-row">
                <span className="debug-label">lastUpdate</span>
                <span className="debug-value">
                  {ageSec !== null ? `${ageSec}s ago` : 'never'}
                  {lastUpdate && (
                    <span className="debug-value-sub">
                      {' '}({new Date(lastUpdate).toISOString().substring(11, 23)})
                    </span>
                  )}
                </span>
              </div>
              <div className="debug-agent-row">
                <span className="debug-label">fetchTs</span>
                <span className="debug-value">
                  {fetchAgeSec !== null ? `${fetchAgeSec}s ago` : 'never'}
                  {lastFetchTs && (
                    <span className="debug-value-sub">
                      {' '}({new Date(lastFetchTs).toISOString().substring(11, 23)})
                    </span>
                  )}
                </span>
              </div>
              <div className="debug-agent-row">
                <span className="debug-label">GPUs cached</span>
                <span className="debug-value">{gpus.length}</span>
              </div>
              {agent.lastError && (
                <div className="debug-agent-row debug-agent-error">
                  <span className="debug-label">Error</span>
                  <span className="debug-value">{agent.lastError}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
