import { contextBridge, ipcRenderer } from 'electron';

/**
 * Expose a minimal API to the renderer process via contextBridge.
 * This is the safe IPC bridge — the renderer never touches Node.js directly.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  /** Load settings from disk. */
  getSettings: (): Promise<unknown> => ipcRenderer.invoke('get-settings'),

  /** Save settings to disk. */
  saveSettings: (settings: unknown): Promise<boolean> =>
    ipcRenderer.invoke('save-settings', settings),

  /** Trigger a manual refresh of all agents. */
  onRefreshAgents: (callback: () => void) => {
    ipcRenderer.on('refresh-agents', () => callback());
  },

  /** Open the settings modal. */
  onOpenSettings: (callback: () => void) => {
    ipcRenderer.on('open-settings', () => callback());
  },

  /** Close (hide) the window. */
  onWindowClose: () => {
    ipcRenderer.send('window-close');
  },

  /** Notify main process of max GPU temperature to update tray icon. */
  updateTrayTemp: (maxTemp: number, warn: number, critical: number) => {
    ipcRenderer.send('update-tray-temp', { maxTemp, warn, critical });
  },
});
