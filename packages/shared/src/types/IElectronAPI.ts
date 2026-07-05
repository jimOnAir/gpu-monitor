import type { IAgent } from './IAgent';
import type { ISettings } from './ISettings';
import type { IGpu } from './IGpu';

/**
 * Type-safe IPC payload between the Electron main process and renderer.
 * Both `preload.ts` and the renderer consume this module for identical types.
 */

export type FetchResult = 'pending' | 'ok' | 'fetch-failed' | 'health-failed' | 'error';

export interface GpuDataPayload {
  agents: IAgent[];
  gpus: Array<{ agentId: string; gpus: IGpu[] }>;
  lastUpdate: Array<[string, number]>;
  lastFetchTimestamp: Array<[string, number]>;
  statusChangedAt: Array<[string, number]>;
  fetchResult: Array<[string, FetchResult]>;
}

export interface IElectronAPI {
  getSettings: () => Promise<ISettings | null>;
  saveSettings: (settings: ISettings) => Promise<boolean>;
  onOpenSettings: (callback: () => void) => void;
  onWindowClose: () => void;
  onGpuDataUpdate: (callback: (data: GpuDataPayload) => void) => void;
}
