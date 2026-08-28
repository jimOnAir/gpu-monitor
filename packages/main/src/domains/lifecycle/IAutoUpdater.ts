export interface UpdateInfo {
  version: string;
  releaseNotes?: string | string[];
}

/**
 * Adapter interface for the auto-updater.
 * Keeps the lifecycle domain free of electron-updater imports.
 */
export interface IAutoUpdater {
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => void;
  onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => void;
  onError: (callback: (message: string) => void) => void;
  start: () => void;
}
