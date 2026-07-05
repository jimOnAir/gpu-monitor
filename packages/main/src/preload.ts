/* fallow: This file is a separate esbuild entry point (see scripts/build-esbuild.js:65-69),
   not dead code. Ignored in fallow analysis. */
import { contextBridge, ipcRenderer } from 'electron';

import type { GpuDataPayload, IElectronAPI, ISettings } from '@gpu-monitor/shared';

/**
 * Expose a minimal API to the renderer process via contextBridge.
 * This is the safe IPC bridge — the renderer never touches Node.js directly.
 */
const api: IElectronAPI = {
  getSettings: async (): Promise<ISettings | null> => ipcRenderer.invoke('get-settings'),

  saveSettings: async (settings: ISettings): Promise<boolean> =>
    ipcRenderer.invoke('save-settings', settings) as Promise<boolean>,

  onOpenSettings: (callback: () => void) => {
    ipcRenderer.on('open-settings', () => {
      callback();
    });
  },

  onWindowClose: () => {
    ipcRenderer.send('window-close');
  },

  onGpuDataUpdate: (callback: (data: GpuDataPayload) => void) => {
    ipcRenderer.on('gpu-data-update', (_event, data) => {
      callback(data as GpuDataPayload);
    });
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
