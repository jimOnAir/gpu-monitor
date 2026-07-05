/* fallow: This file is a separate esbuild entry point (see scripts/build-esbuild.js:65-69),
   not dead code. Ignored in fallow analysis. */
import { contextBridge, ipcRenderer } from 'electron';

/**
 * Expose a minimal API to the renderer process via contextBridge.
 * This is the safe IPC bridge — the renderer never touches Node.js directly.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  /** Load settings from disk. */
  getSettings: async (): Promise<unknown> => ipcRenderer.invoke('get-settings'),

  /** Save settings to disk. */
  saveSettings: async (settings: unknown): Promise<boolean> =>
    ipcRenderer.invoke('save-settings', settings) as Promise<boolean>,

  /** Open the settings modal. */
  onOpenSettings: (callback: () => void) => {
    ipcRenderer.on('open-settings', () => {
      callback();
    });
  },

  /** Close (hide) the window. */
  onWindowClose: () => {
    ipcRenderer.send('window-close');
  },

  /** Push GPU data from main process to renderer. */
  onGpuDataUpdate: (callback: (data: unknown) => void) => {
    ipcRenderer.on('gpu-data-update', (_event, data) => {
      callback(data);
    });
  },
});
