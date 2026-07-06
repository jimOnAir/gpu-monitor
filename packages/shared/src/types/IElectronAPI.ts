import type { FetchResult } from './AgentData';
import type { IAgent } from './IAgent';
import type { IGpu } from './IGpu';
import type { IpcEventMap, IpcInvokeMap } from './IpcChannels';

/**
 * Type-safe IPC payload between the Electron main process and renderer.
 * Both `preload.ts` and the renderer consume this module for identical types.
 */

export interface GpuDataPayload {
  agents: IAgent[];
  gpus: Array<{ agentId: string, gpus: IGpu[] }>;
  lastUpdate: Array<[string, number]>;
  lastFetchTimestamp: Array<[string, number]>;
  statusChangedAt: Array<[string, number]>;
  fetchResult: Array<[string, FetchResult]>;
}

/**
 * Derived from IpcInvokeMap — auto-generates typed invoke methods.
 * Each entry becomes: (args) => Promise<return>
 */
export type IElectronInvokeApi = {
  [K in keyof IpcInvokeMap]: (
    ...args: IpcInvokeMap[K]['args']
  ) => Promise<IpcInvokeMap[K]['return']>;
};

/**
 * Derived from IpcEventMap — auto-generates typed event listener methods.
 * Each entry becomes: (callback) => () => void  (returns unsubscribe function)
 */
export type IElectronEventApi = {
  [K in keyof IpcEventMap]: (
    callback: (...args: IpcEventMap[K]['args']) => void,
  ) => () => void;
};

/**
 * Complete IPC surface exposed via contextBridge.
 * Composed of invoke handlers (request/response) and event listeners (push).
 */
export type IElectronAPI = IElectronInvokeApi & IElectronEventApi;
