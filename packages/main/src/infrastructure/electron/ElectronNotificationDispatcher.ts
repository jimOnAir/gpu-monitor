import { Notification } from 'electron';

import type { INotificationDispatcher } from '../../domains/notifications/INotificationDispatcher';

export class ElectronNotificationDispatcher implements INotificationDispatcher {
  show(options: { title: string, body: string, icon?: string, silent: boolean }): void {
    const notif = new Notification({ ...options });
    notif.show();
  }
}
