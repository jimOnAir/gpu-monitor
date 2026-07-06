import type { app } from 'electron';
import * as path from 'path';

import type { ICrashRecoveryService } from '../../domains/ICrashRecoveryService';
import type { IFileStorage } from '../../domains/settings/IFileStorage';

const MAX_CRASH_COUNT = 3;
const CRASH_WINDOW_MS = 30 * 60 * 1000;

/**
 * Electron-specific crash recovery service.
 * Manages crash log file in Electron's userData directory to detect crash loops.
 */
export class ElectronCrashRecoveryService implements ICrashRecoveryService {
  private readonly electronApp: typeof app;

  constructor(
    electronApp: typeof app,
    private readonly fileStorage: IFileStorage,
  ) {
    this.electronApp = electronApp;
  }

  recordCrash(): boolean {
    const crashLogFile = this.getCrashLogPath();
    try {
      let crashes: Array<{ timestamp: number }> = [];
      if (this.fileStorage.existsSync(crashLogFile)) {
        const raw = this.fileStorage.readFileSync(crashLogFile, 'utf-8');
        const parsed = JSON.parse(raw) as { crashes?: Array<{ timestamp: number }> };
        crashes = parsed.crashes || [];
      }
      const now = Date.now();
      crashes = crashes.filter((c) => now - c.timestamp < CRASH_WINDOW_MS);
      crashes.push({ timestamp: now });
      this.fileStorage.writeFileSync(crashLogFile, JSON.stringify({ crashes }, null, 2), { mode: 0o600 });

      return crashes.length >= MAX_CRASH_COUNT;
    } catch {
      return false;
    }
  }

  recordStartup(): void {
    const crashLogFile = this.getCrashLogPath();
    try {
      this.fileStorage.writeFileSync(crashLogFile, JSON.stringify({ crashes: [] }, null, 2), { mode: 0o600 });
    } catch (err) {
      console.error('Failed to clear crash log:', err);
    }
  }

  getUserDataPath(): string {
    return this.electronApp.getPath('userData');
  }

  private getCrashLogPath(): string {
    return path.join(this.electronApp.getPath('userData'), 'crash-log.json');
  }
}
