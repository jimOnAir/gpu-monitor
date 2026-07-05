/**
 * Type-safe IPC channel definitions.
 * Central source of truth for channel names, argument types, and return types.
 * Used by main (handlers), preload (bridge), and renderer (typed access).
 */

import { EIPC } from '../enums/EIPC';
import type { GpuDataPayload } from './IElectronAPI';
import type { ISettings } from './ISettings';

// ---------- Invoke map (request/response via ipcRenderer.invoke) ----------

/**
 * Maps renderer-facing invoke/handle channels to their argument and return types.
 * Each key is the handler name (e.g. `getSettings`), args are the ipc args,
 * and return is the Promise type.
 */
export type IpcInvokeMap = {
  getSettings: { args: []; return: ISettings | null };
  saveSettings: { args: [settings: ISettings]; return: boolean };
  onWindowClose: { args: []; return: void };
};

// ---------- Event map (one-way channels via ipcRenderer.on) ----------

/**
 * Maps event handler names to their underlying IPC channel and argument types.
 * Keys are the handler names used in IElectronAPI (e.g. `onGpuDataUpdate`).
 * `channel` is the EIPC enum value passed to ipcRenderer.on / webContents.send.
 */
export type IpcEventMap = {
  onGpuDataUpdate: { channel: EIPC.GPU_DATA_UPDATE; args: [data: GpuDataPayload] };
  onOpenSettings: { channel: EIPC.OPEN_SETTINGS; args: [] };
};

/** Runtime event channel map — mirrors IpcEventMap as a value for typedOn. */
export const IpcEventChannels: { [K in keyof IpcEventMap]: string } = {
  onGpuDataUpdate: EIPC.GPU_DATA_UPDATE,
  onOpenSettings: EIPC.OPEN_SETTINGS,
};

/** Runtime invoke channel map — mirrors IpcInvokeMap as a value for typedInvoke. */
export const IpcInvokeChannels: { [K in keyof IpcInvokeMap]: string } = {
  getSettings: EIPC.GET_SETTINGS,
  saveSettings: EIPC.SAVE_SETTINGS,
  onWindowClose: EIPC.WINDOW_CLOSE,
};
