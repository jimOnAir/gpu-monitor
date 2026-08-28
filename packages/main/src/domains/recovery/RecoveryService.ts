import type { ICrashRecoveryService } from '../ICrashRecoveryService';
import type { ISettingsRepository } from '../settings/ISettingsService';

import type { IDialogAdapter } from './IDialogAdapter';

/**
 * Crash-recovery policy: decides what to do when a crash loop is detected.
 * The mechanism (crash log) lives in ICrashRecoveryService; the dialog and
 * settings-backup policy live here.
 */
export class RecoveryService {
  constructor(
    private readonly crashRecovery: ICrashRecoveryService,
    private readonly dialog: IDialogAdapter,
    private readonly settingsRepository: ISettingsRepository,
    private readonly onReset: () => void,
    private readonly onQuit: () => void,
  ) {}

  /**
   * Returns true if a crash loop was detected and the recovery dialog was shown.
   */
  async handleCrashLoop(): Promise<boolean> {
    if (!this.crashRecovery.recordCrash()) {
      return false;
    }

    const result = await this.dialog.showMessageBox({
      type: 'warning',
      title: 'GPU Monitor',
      message: 'The app crashed multiple times on startup.',
      detail: 'Would you like to reset settings and restart?',
      buttons: ['Reset & Restart', 'Quit'],
      defaultId: 0,
      cancelId: 1,
    });

    if (result.response === 0) {
      this.settingsRepository.backup();
      this.onReset();
    } else {
      this.onQuit();
    }

    return true;
  }

  recordStartup(): void {
    this.crashRecovery.recordStartup();
  }
}
