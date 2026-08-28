import type { IpcResult, ISettings } from '@gpu-monitor/shared';
import { EIPC } from '@gpu-monitor/shared';
import { ipcMain } from 'electron';
import type { Logger } from 'pino';

import type { IPollingService } from './domains/polling/IPollingService';
import type { ISettingsRepository } from './domains/settings/ISettingsService';
import type { IWindowService } from './domains/windows/IWindowService';
import { parseSettings } from './settings';

export class IpcHandler {
  constructor(
    private readonly settingsRepository: ISettingsRepository,
    private readonly pollingService: IPollingService,
    private readonly windowService: IWindowService,
    private readonly logger: Logger,
  ) {}

  register(): void {
    ipcMain.handle(EIPC.WINDOW_CLOSE, (): IpcResult<void> => {
      this.logger.info('IPC window-close');
      this.windowService.hideMainWindow();

      return { success: true, data: undefined };
    });

    ipcMain.handle(EIPC.CLOSE_PREFERENCES, (): IpcResult<void> => {
      this.logger.info('IPC close-preferences');
      this.windowService.togglePreferencesWindow();

      return { success: true, data: undefined };
    });

    ipcMain.handle(EIPC.GET_SETTINGS, (): IpcResult<ISettings | null> => {
      this.logger.debug('IPC get-settings');

      return { success: true, data: this.settingsRepository.load() };
    });

    ipcMain.handle(EIPC.OPEN_PREFERENCES, (): IpcResult<void> => {
      this.logger.info('IPC open-preferences');
      this.windowService.togglePreferencesWindow();

      return { success: true, data: undefined };
    });

    ipcMain.handle(EIPC.SAVE_SETTINGS, (_event: unknown, rawSettings: unknown): IpcResult<boolean> => {
      const parsed = parseSettings(rawSettings, this.logger);
      if (!parsed) {
        return { success: false, error: 'Invalid settings' };
      }
      this.logger.info({ agents: parsed.agents.length }, 'IPC save-settings');
      if (!this.settingsRepository.save(parsed)) {
        return { success: false, error: 'Invalid settings' };
      }
      void this.pollingService.refreshAgents();

      return { success: true, data: true };
    });
  }
}
