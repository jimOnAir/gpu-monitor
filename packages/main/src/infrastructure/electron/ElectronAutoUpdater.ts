import { app } from 'electron';
import { autoUpdater } from 'electron-updater';

import type { IAutoUpdater, UpdateInfo } from '../../domains/lifecycle/IAutoUpdater';

const SEMVER_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

export class ElectronAutoUpdater implements IAutoUpdater {
  private get enabled(): boolean {
    // electron-updater throws at construction when the app version is not
    // a valid semver (e.g. dev builds with version "0.0").
    return SEMVER_RE.test(app.getVersion());
  }

  onUpdateAvailable(callback: (info: UpdateInfo) => void): void {
    if (!this.enabled) {
      return;
    }
    autoUpdater.on('update-available', (info) => {
      const rawNotes = info.releaseNotes;
      const notes = Array.isArray(rawNotes)
        ? rawNotes.map((n) => (typeof n === 'string' ? n : n.note)).filter((n): n is string => Boolean(n))
        : (rawNotes ?? undefined);
      callback({ version: info.version, releaseNotes: notes });
    });
  }

  onUpdateDownloaded(callback: (info: UpdateInfo) => void): void {
    if (!this.enabled) {
      return;
    }
    autoUpdater.on('update-downloaded', (info) => {
      callback({ version: info.version });
    });
  }

  onError(callback: (message: string) => void): void {
    if (!this.enabled) {
      return;
    }
    autoUpdater.on('error', (err: Error) => {
      callback(err.message);
    });
  }

  start(): void {
    if (!this.enabled) {
      return;
    }
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    setImmediate(() => {
      autoUpdater.checkForUpdates().catch(() => {
        // Update check failures are non-fatal (no feed configured, offline, etc.)
      });
    });
  }
}
