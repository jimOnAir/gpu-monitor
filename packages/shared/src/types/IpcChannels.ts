/**
 * Type-safe IPC channel definitions.
 * Central source of truth for channel names, argument types, and return types.
 * Used by main (handlers), preload (bridge), and renderer (via IElectronAPI).
 */

import { EIPC } from '../enums/EIPC';

import type { GpuDataPayload } from './IElectronAPI';
import type { ISettings } from './ISettings';

// ---------- Auto-update types ----------

export interface UpdateAvailableInfo {
  version: string;
  releaseNotes?: string | string[];
}

export interface UpdateDownloadedInfo {
  version: string;
}

// ---------- IPC Result type ----------

/**
 * Standardized IPC response wrapper. Preserves full error context across the IPC boundary
 * (Electron only serializes the `message` property of Error objects by default).
 */
export type IpcResult<T, E = string>
  = | { success: true, data: T, error?: never }
  | { success: false, data?: never, error: E };

// ---------- Invoke map (request/response via ipcRenderer.invoke) ----------

/**
 * Maps renderer-facing invoke/handle channels to their argument and return types.
 * Each key is the handler name (e.g. `getSettings`), args are the ipc args,
 * and return is the Promise<IpcResult<...>> type.
 */
export type IpcInvokeMap = {
  getSettings: { args: [], return: IpcResult<ISettings | null> },
  saveSettings: { args: [settings: ISettings], return: IpcResult<boolean> },
  onWindowClose: { args: [], return: IpcResult<void> },
  onClosePreferences: { args: [], return: IpcResult<void> },
  openPreferences: { args: [], return: IpcResult<void> },
};

// ---------- Event map (one-way channels via ipcRenderer.on) ----------

/**
 * Maps event handler names to their underlying IPC channel and argument types.
 * Keys are the handler names used in IElectronAPI (e.g. `onGpuDataUpdate`).
 * `channel` is the EIPC enum value passed to ipcRenderer.on / webContents.send.
 */
export type IpcEventMap = {
  onGpuDataUpdate: { channel: EIPC.GPU_DATA_UPDATE, args: [data: GpuDataPayload] },
  onOpenPreferences: { channel: EIPC.OPEN_PREFERENCES, args: [] },
  onUpdateAvailable: { channel: EIPC.UPDATE_AVAILABLE, args: [info: UpdateAvailableInfo] },
  onUpdateDownloaded: { channel: EIPC.UPDATE_DOWNLOADED, args: [info: UpdateDownloadedInfo] },
  onWindowFocus: { channel: EIPC.WINDOW_FOCUS, args: [] },
  onWindowBlur: { channel: EIPC.WINDOW_BLUR, args: [] },
};

/** Runtime event channel map — mirrors IpcEventMap as a value for typedOn. */
export const IpcEventChannels: { [K in keyof IpcEventMap]: string } = {
  onGpuDataUpdate: EIPC.GPU_DATA_UPDATE,
  onOpenPreferences: EIPC.OPEN_PREFERENCES,
  onUpdateAvailable: EIPC.UPDATE_AVAILABLE,
  onUpdateDownloaded: EIPC.UPDATE_DOWNLOADED,
  onWindowFocus: EIPC.WINDOW_FOCUS,
  onWindowBlur: EIPC.WINDOW_BLUR,
};

/** Runtime invoke channel map — mirrors IpcInvokeMap as a value for typedInvoke. */
export const IpcInvokeChannels: { [K in keyof IpcInvokeMap]: string } = {
  getSettings: EIPC.GET_SETTINGS,
  saveSettings: EIPC.SAVE_SETTINGS,
  onWindowClose: EIPC.WINDOW_CLOSE,
  onClosePreferences: EIPC.CLOSE_PREFERENCES,
  openPreferences: EIPC.OPEN_PREFERENCES,
};
