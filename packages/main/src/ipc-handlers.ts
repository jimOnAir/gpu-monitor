/**
 * IPC handlers.
 * Handles all IPC communication between main and renderer processes.
 */

import type { IpcResult } from '@gpu-monitor/shared';
import type { ISettings } from '@gpu-monitor/shared';
import { EIPC } from '@gpu-monitor/shared';
import { ipcMain } from 'electron';

import logger from './logger';
import { startPolling } from './polling';
import { parseSettings } from './settings';
import { loadSettings as loadSettingsFromFile, saveSettings as saveSettingsToFile } from './settings-persistence';
import { getMainWindow, getPreferencesWindow, createPreferencesWindow } from './windows';

/** Register all IPC handlers. */
export function registerIpcHandlers(): void {
  ipcMain.handle(EIPC.WINDOW_CLOSE, (): IpcResult<void> => {
    logger.info('IPC window-close');
    const mainWin = getMainWindow();
    mainWin?.hide();

    return { success: true, data: undefined };
  });

  ipcMain.handle(EIPC.CLOSE_PREFERENCES, (): IpcResult<void> => {
    logger.info('IPC close-preferences');
    const prefWin = getPreferencesWindow();
    if (prefWin) {
      prefWin.hide();
    }

    return { success: true, data: undefined };
  });

  ipcMain.handle(EIPC.GET_SETTINGS, (): IpcResult<ISettings | null> => {
    logger.debug('IPC get-settings');

    return { success: true, data: loadSettingsFromFile() };
  });

  ipcMain.handle(EIPC.OPEN_PREFERENCES, (): IpcResult<void> => {
    logger.info('IPC open-preferences');
    const mainWin = getMainWindow();
    createPreferencesWindow(mainWin);

    return { success: true, data: undefined };
  });

  ipcMain.handle(EIPC.SAVE_SETTINGS, (_event: unknown, settings: unknown): IpcResult<boolean> => {
    const validated = parseSettings(settings);
    if (!validated) {
      logger.error('IPC save-settings: settings validation failed');

      return { success: false, error: 'Invalid settings' };
    }
    const agents = validated.agents.length;
    logger.info({ agents }, 'IPC save-settings');
    if (!saveSettingsToFile(validated)) {
      return { success: false, error: 'Failed to write settings file' };
    }
    startPolling(validated);

    return { success: true, data: true };
  });
}
