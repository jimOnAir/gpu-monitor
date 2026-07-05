import { DEFAULT_SETTINGS, type ISettings } from '@gpu-monitor/shared';
import { useState, useEffect, useCallback } from 'react';

import { SettingsModal } from './components/SettingsModal';

/**
 * Standalone settings page for the Preferences window.
 * Loads settings from Electron API and provides save functionality.
 */
export const SettingsApp: React.FC = () => {
  const [settings, setSettings] = useState<ISettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [saveSuccess, setSaveSuccess] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        if (window.electronAPI) {
          const result = await window.electronAPI.getSettings();
          if (result.success && result.data) {
            setSettings(result.data);
          } else {
            setError(result.error || 'Failed to load settings');
          }
        } else {
          setError('window.electronAPI is not available');
        }
      } catch (err) {
        setError(`Failed to load settings: ${err}`);
      } finally {
        setIsLoading(false);
      }
    };
    void loadSettings();
  }, []);

  // Save settings
  const handleSave = useCallback(async (newSettings: ISettings) => {
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.saveSettings(newSettings);
        if (result.success) {
          setSettings(newSettings);
          setSaveSuccess(true);
          // Close the preferences window after successful save
          setTimeout(() => {
            void window.electronAPI?.onWindowClose();
          }, 1000);
        } else {
          setError(result.error || 'Failed to save settings');
        }
      }
    } catch (err) {
      setError(`Failed to save settings: ${err}`);
    }
  }, []);

  if (isLoading) {
    return <div className="loading">Loading settings...</div>;
  }

  if (error) {
    return (
      <div className="error">
        <h2>Error</h2>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="settings-window">
      {/* Title Bar */}
      <div className="settings-title-bar">
        <span className="settings-title">Preferences</span>
        <button
          className="settings-close-btn"
          onClick={() => {
            void window.electronAPI?.onClosePreferences();
          }}
          title="Close"
        >
          ✕
        </button>
      </div>

      <div className="settings-content">
        <SettingsModal
          isOpen={true}
          onClose={() => {
            void window.electronAPI?.onClosePreferences();
          }}
          settings={settings}
          onSave={handleSave}
        />
      </div>

      {saveSuccess === true && (
        <div className="toast toast-success">Settings saved!</div>
      )}

      {saveSuccess === false && (
        <div className="toast toast-error">Failed to save settings</div>
      )}
    </div>
  );
};
