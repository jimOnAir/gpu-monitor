import type { ISettings } from '@gpu-monitor/shared';
import { useEffect, useState } from 'react';

interface UseSettingsOptions {
  onError?: (error: string) => void;
}

/**
 * Loads settings from the Electron API on mount.
 * Returns [settings, loading, setSettings].
 * setSettings allows updating settings locally (e.g., after a successful save).
 */
export function useSettings(options: UseSettingsOptions = {}): [ISettings | null, boolean, (settings: ISettings) => void] {
  const [settings, setSettings] = useState<ISettings | null>(null);
  const [loading, setLoading] = useState(true);
  const { onError } = options;

  useEffect(() => {
    const loadSettings = async () => {
      try {
        if (window.electronAPI) {
          const result = await window.electronAPI.getSettings();
          if (result.success && result.data) {
            setSettings(result.data);
          } else {
            onError?.(result.error || 'Failed to load settings');
          }
        } else {
          onError?.('window.electronAPI is not available');
        }
      } catch (err) {
        onError?.(`Failed to load settings: ${err}`);
      } finally {
        setLoading(false);
      }
    };
    void loadSettings();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return [settings, loading, setSettings];
}
