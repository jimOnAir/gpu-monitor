/* fallow: This file is a separate esbuild entry point (see scripts/build-esbuild.js:65-69),
   not dead code. Ignored in fallow analysis. */
import type {
  GpuDataPayload,
  IpcEventMap,
  IpcInvokeMap,
  IpcResult,
  ISettings,
} from '@gpu-monitor/shared';
import { IpcEventChannels, IpcInvokeChannels } from '@gpu-monitor/shared';
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

// ---------- Typed IPC wrappers ----------

/** Type-safe invoke — infers args and return from IpcInvokeMap. Throws on error responses. */
async function typedInvoke<K extends keyof IpcInvokeMap>(
  key: K,
  ...args: IpcInvokeMap[K]['args']
): Promise<IpcInvokeMap[K]['return']> {
  const channel = IpcInvokeChannels[key];
  const result = await ipcRenderer.invoke(channel, ...args) as IpcResult<unknown>;
  if (!result.success) {
    throw new Error(result.error);
  }

  return result as unknown as IpcInvokeMap[K]['return'];
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

/** Validate arguments before forwarding IPC calls to the main process. */
function validateInvokeArgs(
  key: keyof IpcInvokeMap,
  args: unknown[],
): void {
  if (key === 'saveSettings') {
    const [settings] = args;
    if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) {
      throw new Error('saveSettings: expected settings object');
    }
  }
}

/**
 * Expose a minimal API to the renderer process via contextBridge.
 * This is the safe IPC bridge — the renderer never touches Node.js directly.
 */
const api = {
  // --- Invoke (request/response) ---
  getSettings: async () => typedInvoke('getSettings'),
  saveSettings: async (settings: ISettings) => {
    validateInvokeArgs('saveSettings', [settings]);

    return typedInvoke('saveSettings', settings);
  },
  onWindowClose: async () => typedInvoke('onWindowClose'),
  onClosePreferences: async () => typedInvoke('onClosePreferences'),
  openPreferences: async () => typedInvoke('openPreferences'),

  // --- Events (main → renderer, with cleanup) ---
  onGpuDataUpdate: (cb: (data: GpuDataPayload) => void) =>
    typedOn('onGpuDataUpdate', cb),
  onOpenPreferences: (cb: () => void) =>
    typedOn('onOpenPreferences', cb),
  onUpdateAvailable: (cb: (info: { version: string, releaseNotes?: string | string[] }) => void) =>
    typedOn('onUpdateAvailable', cb),
  onUpdateDownloaded: (cb: (info: { version: string }) => void) =>
    typedOn('onUpdateDownloaded', cb),
  onWindowFocus: (cb: () => void) => typedOn('onWindowFocus', cb),
  onWindowBlur: (cb: () => void) => typedOn('onWindowBlur', cb),
};

contextBridge.exposeInMainWorld('electronAPI', api);
