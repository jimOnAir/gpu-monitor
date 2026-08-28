import type { ISettings } from '@gpu-monitor/shared';

import type { Logger } from '../../logger';
import type { IPollingService } from '../polling/IPollingService';
import type { IWindowService } from '../windows/IWindowService';

import type { IAppLifecycle } from './IAppLifecycle';
import type { IAutoUpdater } from './IAutoUpdater';

/**
 * App lifecycle: second-instance focus, activate, before-quit,
 * and the auto-updater.
 */
export class LifecycleService {
  constructor(
    private readonly logger: Logger,
    private readonly appLifecycle: IAppLifecycle,
    private readonly autoUpdater: IAutoUpdater,
    private readonly windowService: IWindowService,
    private readonly pollingService: IPollingService,
    private readonly getSettings: () => ISettings | null,
  ) {}

  register(): void {
    this.appLifecycle.onSecondInstance(() => {
      this.logger.info('Second instance attempted — focusing existing window');
      const mainWin = this.windowService.getMainWindow();
      if (mainWin) {
        if (mainWin.isMinimized()) {
          mainWin.restore();
        }
        mainWin.show();
        mainWin.focus();
      }
    });

    this.appLifecycle.onActivate(() => {
      const settings = this.getSettings();
      if (!settings) {
        this.logger.warn('Activate before settings loaded — nothing to do');

        return;
      }
      this.windowService.ensureMainWindow(settings);
    });

    this.appLifecycle.onBeforeQuit(() => {
      this.windowService.setWillQuit(true);
      this.pollingService.stopPolling();
    });

    this.autoUpdater.onUpdateAvailable((info) => {
      this.logger.info(`Update available: ${info.version}`);
      this.windowService.getMainWindow()?.send('UPDATE_AVAILABLE', info);
    });

    this.autoUpdater.onUpdateDownloaded((info) => {
      this.logger.info(`Update downloaded: ${info.version}`);
      this.windowService.getMainWindow()?.send('UPDATE_DOWNLOADED', info);
    });

    this.autoUpdater.onError((message) => {
      this.logger.warn({ err: message }, 'Auto-update error');
    });

    this.autoUpdater.start();
  }
}
