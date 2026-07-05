/* fallow: This file is a separate esbuild entry point (see scripts/build-esbuild.js:65-69),
   not dead code. Ignored in fallow analysis. */
import type {
  GpuDataPayload,
  IpcEventMap,
  IpcInvokeMap,
  ISettings,
} from '@gpu-monitor/shared';
import { EIPC, IpcEventChannels, IpcInvokeChannels } from '@gpu-monitor/shared';
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

// ---------- Typed IPC wrappers ----------

/** Type-safe invoke — infers args and return from IpcInvokeMap. */
function typedInvoke<K extends keyof IpcInvokeMap>(
  key: K,
  ...args: IpcInvokeMap[K]['args']
): Promise<IpcInvokeMap[K]['return']> {
  const channel = IpcInvokeChannels[key];
  return ipcRenderer.invoke(channel, ...args);
}

/** Type-safe one-way event listener — returns unsubscribe function. */
function typedOn<K extends keyof IpcEventMap>(
  key: K,
  callback: (...args: IpcEventMap[K]['args']) => void,
): () => void {
  const channel = IpcEventChannels[key];
  const handler = (_event: IpcRendererEvent, ...args: unknown[]): void => {
    callback(...(args as IpcEventMap[K]['args']));
  };
  ipcRenderer.on(channel, handler);
  return (): void => {
    ipcRenderer.removeListener(channel, handler);
  };
}

/**
 * Expose a minimal API to the renderer process via contextBridge.
 * This is the safe IPC bridge — the renderer never touches Node.js directly.
 */
const api = {
  // --- Invoke (request/response) ---
  getSettings: () => typedInvoke('getSettings'),
  saveSettings: (settings: ISettings) => typedInvoke('saveSettings', settings),
  onWindowClose: () => typedInvoke('onWindowClose'),

  // --- Events (main → renderer, with cleanup) ---
  onGpuDataUpdate: (cb: (data: GpuDataPayload) => void) =>
    typedOn('onGpuDataUpdate', cb),
  onOpenSettings: (cb: () => void) =>
    typedOn('onOpenSettings', cb),
};

contextBridge.exposeInMainWorld('electronAPI', api);
