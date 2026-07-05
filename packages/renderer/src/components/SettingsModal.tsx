import type { ISettings, IAgent, ITemperatureThresholds, INotificationCooldowns } from '@gpu-monitor/shared';
import { EAgentStatus } from '@gpu-monitor/shared';
import React, { useState, useEffect } from 'react';

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
  const [notificationsEnabled, setNotificationsEnabled] = useState(settings.notifications.enabled);
  const [cooldowns, setCooldowns] = useState<INotificationCooldowns>(settings.notifications.cooldowns);

  useEffect(() => {
    if (isOpen) {
      setAgents(settings.agents);
      setRefreshInterval(settings.refreshInterval);
      setThresholds(settings.thresholds);
      setNotificationsEnabled(settings.notifications.enabled);
      setCooldowns(settings.notifications.cooldowns);
    }
  }, [isOpen, settings]);

  if (!isOpen) {
    return null;
  }

  const handleSave = () => {
    const newSettings: ISettings = {
      agents,
      refreshInterval,
      thresholds,
      notifications: {
        enabled: notificationsEnabled,
        cooldowns,
      },
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
      agents.map((a) => (a.id === id ? { ...a, [field]: value } : a)),
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
    <div
      className="modal-backdrop"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          onClose();
        }
      }}
      role="dialog"
      aria-label="Settings"
      tabIndex={-1}
    >
      <div
        className="modal-container"
        onClick={(e) => {
          e.stopPropagation();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            onClose();
          }
        }}
        tabIndex={-1}
      >
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
                  onChange={(e) => {
                    updateAgent(agent.id, 'name', e.target.value);
                  }}
                  placeholder="Name"
                  className="agent-edit-input"
                />
                <input
                  type="text"
                  value={agent.url}
                  onChange={(e) => {
                    updateAgent(agent.id, 'url', e.target.value);
                  }}
                  placeholder="http://..."
                  className="agent-edit-input url"
                />
                <button
                  className="agent-edit-delete-btn"
                  onClick={() => {
                    removeAgent(agent.id);
                  }}
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
                onChange={(e) => {
                  setRefreshInterval(Number(e.target.value) * 1000);
                }}
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
                    <label htmlFor={`warn-${type}`}>Warn</label>
                    <input
                      id={`warn-${type}`}
                      type="number"
                      value={thresholds[type].warn}
                      onChange={(e) => {
                        updateThreshold(type, 'warn', Number(e.target.value));
                      }}
                      className="threshold-input"
                    />
                  </div>
                  <div className="threshold-input-group">
                    <label htmlFor={`critical-${type}`}>Critical</label>
                    <input
                      id={`critical-${type}`}
                      type="number"
                      value={thresholds[type].critical}
                      onChange={(e) => {
                        updateThreshold(type, 'critical', Number(e.target.value));
                      }}
                      className="threshold-input"
                    />
                  </div>
                </div>
              </div>
            ))}
          </section>

          {/* Notifications */}
          <section className="modal-section">
            <h3>Notifications</h3>
            <div className="notifications-row">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={notificationsEnabled}
                  onChange={(e) => {
                    setNotificationsEnabled(e.target.checked);
                  }}
                />
                Enable system notifications
              </label>
            </div>
            <div className="cooldowns-grid">
              <div className="cooldown-row">
                <label htmlFor="cooldown-tempCritical">Temperature Critical</label>
                <input
                  id="cooldown-tempCritical"
                  type="number"
                  min={1}
                  max={600}
                  value={cooldowns.tempCritical / 1000}
                  onChange={(e) => {
                    setCooldowns({ ...cooldowns, tempCritical: Number(e.target.value) * 1000 });
                  }}
                  className="threshold-input"
                />
                <span>s</span>
              </div>
              <div className="cooldown-row">
                <label htmlFor="cooldown-tempWarn">Temperature Warning</label>
                <input
                  id="cooldown-tempWarn"
                  type="number"
                  min={1}
                  max={600}
                  value={cooldowns.tempWarn / 1000}
                  onChange={(e) => {
                    setCooldowns({ ...cooldowns, tempWarn: Number(e.target.value) * 1000 });
                  }}
                  className="threshold-input"
                />
                <span>s</span>
              </div>
              <div className="cooldown-row">
                <label htmlFor="cooldown-tempRecover">Temperature Recovered</label>
                <input
                  id="cooldown-tempRecover"
                  type="number"
                  min={1}
                  max={600}
                  value={cooldowns.tempRecover / 1000}
                  onChange={(e) => {
                    setCooldowns({ ...cooldowns, tempRecover: Number(e.target.value) * 1000 });
                  }}
                  className="threshold-input"
                />
                <span>s</span>
              </div>
              <div className="cooldown-row">
                <label htmlFor="cooldown-agentOffline">Agent Offline</label>
                <input
                  id="cooldown-agentOffline"
                  type="number"
                  min={1}
                  max={600}
                  value={cooldowns.agentOffline / 1000}
                  onChange={(e) => {
                    setCooldowns({ ...cooldowns, agentOffline: Number(e.target.value) * 1000 });
                  }}
                  className="threshold-input"
                />
                <span>s</span>
              </div>
              <div className="cooldown-row">
                <label htmlFor="cooldown-agentOnline">Agent Online</label>
                <input
                  id="cooldown-agentOnline"
                  type="number"
                  min={1}
                  max={600}
                  value={cooldowns.agentOnline / 1000}
                  onChange={(e) => {
                    setCooldowns({ ...cooldowns, agentOnline: Number(e.target.value) * 1000 });
                  }}
                  className="threshold-input"
                />
                <span>s</span>
              </div>
              <div className="cooldown-row">
                <label htmlFor="cooldown-allRecovered">All GPUs Recovered</label>
                <input
                  id="cooldown-allRecovered"
                  type="number"
                  min={1}
                  max={600}
                  value={cooldowns.allRecovered / 1000}
                  onChange={(e) => {
                    setCooldowns({ ...cooldowns, allRecovered: Number(e.target.value) * 1000 });
                  }}
                  className="threshold-input"
                />
                <span>s</span>
              </div>
            </div>
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
