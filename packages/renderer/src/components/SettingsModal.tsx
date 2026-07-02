import React, { useState, useEffect } from 'react';
import { ISettings, IAgent, ITemperatureThresholds, EAgentStatus, DEFAULT_SETTINGS } from '@gpu-monitor/shared';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ISettings;
  onSave: (settings: ISettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave,
}) => {
  const [agents, setAgents] = useState<IAgent[]>(settings.agents);
  const [refreshInterval, setRefreshInterval] = useState(settings.refreshInterval);
  const [thresholds, setThresholds] = useState<ITemperatureThresholds>(settings.thresholds);

  useEffect(() => {
    if (isOpen) {
      setAgents(settings.agents);
      setRefreshInterval(settings.refreshInterval);
      setThresholds(settings.thresholds);
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const handleSave = () => {
    const newSettings: ISettings = {
      agents,
      refreshInterval,
      thresholds,
    };
    onSave(newSettings);
    onClose();
  };

  let agentIdCounter = 0;
  const addAgent = () => {
    agentIdCounter++;
    const newAgent: IAgent = {
      id: `agent-${Date.now()}-${agentIdCounter}`,
      name: 'New Agent',
      url: 'http://',
      status: EAgentStatus.Offline,
    };
    setAgents([...agents, newAgent]);
  };

  const removeAgent = (id: string) => {
    setAgents(agents.filter((a) => a.id !== id));
  };

  const updateAgent = (id: string, field: keyof IAgent, value: string) => {
    setAgents(
      agents.map((a) => (a.id === id ? { ...a, [field]: value } : a))
    );
  };

  const updateThreshold = (type: 'core' | 'junction' | 'vram', field: 'warn' | 'critical', value: number) => {
    setThresholds({
      ...thresholds,
      [type]: {
        ...thresholds[type],
        [field]: value,
      },
    });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="modal-close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {/* Agents Section */}
          <section className="modal-section">
            <h3>Agents</h3>
            {agents.map((agent) => (
              <div key={agent.id} className="agent-edit-row">
                <input
                  type="text"
                  value={agent.name}
                  onChange={(e) => updateAgent(agent.id, 'name', e.target.value)}
                  placeholder="Name"
                  className="agent-edit-input"
                />
                <input
                  type="text"
                  value={agent.url}
                  onChange={(e) => updateAgent(agent.id, 'url', e.target.value)}
                  placeholder="http://..."
                  className="agent-edit-input url"
                />
                <button
                  className="agent-edit-delete-btn"
                  onClick={() => removeAgent(agent.id)}
                  title="Remove agent"
                >
                  ×
                </button>
              </div>
            ))}
            <button className="add-agent-btn" onClick={addAgent}>
              + Add Agent
            </button>
          </section>

          {/* Refresh Interval */}
          <section className="modal-section">
            <h3>Refresh Interval</h3>
            <div className="interval-slider">
              <input
                type="range"
                min={1}
                max={60}
                value={refreshInterval / 1000}
                onChange={(e) => setRefreshInterval(Number(e.target.value) * 1000)}
              />
              <span>{(refreshInterval / 1000).toFixed(0)}s</span>
            </div>
          </section>

          {/* Thresholds */}
          <section className="modal-section">
            <h3>Temperature Thresholds (°C)</h3>
            {(['core', 'junction', 'vram'] as const).map((type) => (
              <div key={type} className="threshold-row">
                <span className="threshold-label">{type.charAt(0).toUpperCase() + type.slice(1)}</span>
                <div className="threshold-inputs">
                  <div className="threshold-input-group">
                    <label>Warn</label>
                    <input
                      type="number"
                      value={thresholds[type].warn}
                      onChange={(e) => updateThreshold(type, 'warn', Number(e.target.value))}
                      className="threshold-input"
                    />
                  </div>
                  <div className="threshold-input-group">
                    <label>Critical</label>
                    <input
                      type="number"
                      value={thresholds[type].critical}
                      onChange={(e) => updateThreshold(type, 'critical', Number(e.target.value))}
                      className="threshold-input"
                    />
                  </div>
                </div>
              </div>
            ))}
          </section>
        </div>

        <div className="modal-footer">
          <button className="modal-btn cancel" onClick={onClose}>
            Cancel
          </button>
          <button className="modal-btn save" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
