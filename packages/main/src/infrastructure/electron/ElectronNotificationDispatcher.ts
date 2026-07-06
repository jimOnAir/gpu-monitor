import { Notification } from 'electron';

import type { INotificationDispatcher } from '../../domains/notifications/INotificationDispatcher';

/**
 * Electron-specific notification dispatcher.
 * Fires native OS notifications via Electron's Notification API.
 * Resolves icon paths relative to the renderer's dist directory.
 */
export class ElectronNotificationDispatcher implements INotificationDispatcher {
  show(options: { title: string, body: string, icon?: string, silent: boolean }): void {
    const icon = options.icon ? `../../assets/${options.icon}` : undefined;
    const notification = new Notification({
      title: options.title,
      body: options.body,
      icon,
      silent: options.silent,
    });
    notification.show();
  }
}
