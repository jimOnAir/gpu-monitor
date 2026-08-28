import { DEFAULT_SETTINGS, type ISettings } from '@gpu-monitor/shared';
import { useState, useCallback } from 'react';

import { SettingsModal } from './components/SettingsModal';
import { useSettings } from './utils/useSettings';

// Delay before auto-closing the preferences window so the user sees the success state.
const CLOSE_DELAY_MS = 1000;

/**
 * Standalone settings page for the Preferences window.
 * Loads settings from Electron API and provides save functionality.
 */
export const SettingsApp: React.FC = () => {
  const [loadedSettings, isLoading] = useSettings();
  const [settings, setSettings] = useState<ISettings>(DEFAULT_SETTINGS);
  const [saveSuccess, setSaveSuccess] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sync loaded settings into component state
  const effectiveSettings = loadedSettings ?? settings;

  // Save settings
  const handleSave = useCallback(async (newSettings: ISettings) => {
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.saveSettings(newSettings);
        if (result.success) {
          setSettings(newSettings);
          setSaveSuccess(true);
          setTimeout(() => {
            void window.electronAPI?.onClosePreferences();
          }, CLOSE_DELAY_MS);
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
          onClose={() => {
            void window.electronAPI?.onClosePreferences();
          }}
          settings={effectiveSettings}
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
