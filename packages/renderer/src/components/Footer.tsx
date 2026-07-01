import React from 'react';
import { AgentState } from '../domains/agents/AgentService';
import { EAgentStatus } from '@gpu-monitor/shared';

interface FooterProps {
  agentState: AgentState;
  refreshInterval: number;
  error?: string;
}

export const Footer: React.FC<FooterProps> = ({
  agentState,
  refreshInterval,
  error,
}) => {
  if (error) {
    return (
      <div className="footer error">
        <span className="footer-icon">⚠</span> {error}
      </div>
    );
  }

  return (
    <div className="footer">
      <div className="footer-items">
        {agentState.agents.map((agent) => {
          const gpus = agentState.gpus.get(agent.id) || [];
          const statusTs = agentState.statusChangedAt.get(agent.id);
          const ageMs = statusTs ? Date.now() - statusTs : null;

          return (
            <React.Fragment key={agent.id}>
              <div className={`footer-agent ${getAgentFooterClass(agent.status)}`}>
                <span className="footer-agent-dot" />
                <span className="footer-agent-name">{agent.name}</span>
                <span className="footer-agent-status">{getStatusLabel(agent.status)}</span>
                {ageMs !== null && (
                  <span className="footer-agent-age">
                    {ageMs < 1000 ? `${ageMs}ms` : ageMs < 60000 ? `${(ageMs / 1000).toFixed(1)}s` : `${Math.floor(ageMs / 60000)}m ${Math.floor(ageMs / 1000 % 60)}s`}
                  </span>
                )}
                {gpus.length > 0 && (
                  <span className="footer-agent-gpus">
                    {gpus.length} GPU{gpus.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>
      <div className="footer-divider">|</div>
      <div className="footer-item">
        Refresh: {(refreshInterval / 1000).toFixed(0)}s
      </div>
    </div>
  );
};

function getAgentFooterClass(status: EAgentStatus): string {
  switch (status) {
    case EAgentStatus.Online:
      return 'online';
    case EAgentStatus.Offline:
      return 'offline';
    case EAgentStatus.Stale:
      return 'stale';
    default:
      return '';
  }
}

function getStatusLabel(status: EAgentStatus): string {
  switch (status) {
    case EAgentStatus.Online:
      return 'Online';
    case EAgentStatus.Offline:
      return 'Offline';
    case EAgentStatus.Stale:
      return 'Stale';
    default:
      return '?';
  }
}
