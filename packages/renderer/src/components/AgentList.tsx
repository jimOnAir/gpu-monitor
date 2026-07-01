import React from 'react';
import { IAgent } from '@gpu-monitor/shared';
import { EAgentStatus } from '@gpu-monitor/shared';

interface AgentListProps {
  agents: IAgent[];
  selectedAgent: string | null;
  onSelectAgent: (agentId: string | null) => void;
}

export const AgentList: React.FC<AgentListProps> = ({
  agents,
  selectedAgent,
  onSelectAgent,
}) => {
  return (
    <div className="agent-list">
      <div className="agent-list-header">
        <h2>Agents</h2>
      </div>
      <div className="agent-list-items">
        {agents.map((agent) => (
            <div
              key={agent.id}
              className={`agent-item ${getAgentStatusClass(agent.status)}${agent.id === selectedAgent ? ' selected' : ''}`}
              onClick={() => onSelectAgent(agent.id === selectedAgent ? null : agent.id)}
            >
            <div className="agent-status-dot" />
            <div className="agent-info">
              <div className="agent-name">{agent.name}</div>
              <div className="agent-url">{agent.url}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

function getAgentStatusClass(status: EAgentStatus): string {
  switch (status) {
    case EAgentStatus.Online:
      return 'online';
    case EAgentStatus.Offline:
      return 'offline';
    case EAgentStatus.Stale:
      return 'stale';
  }
}
