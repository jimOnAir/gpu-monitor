import { app } from 'electron';

import type { IAppLifecycle } from '../../domains/lifecycle/IAppLifecycle';

export class ElectronAppLifecycle implements IAppLifecycle {
  onSecondInstance(callback: () => void): void {
    app.on('second-instance', callback);
  }

  onActivate(callback: () => void): void {
    app.on('activate', callback);
  }

  onBeforeQuit(callback: () => void): void {
    app.on('before-quit', callback);
  }

  quit(): void {
    app.quit();
  }

  relaunch(): void {
    app.relaunch();
  }

  exit(code: number): void {
    app.exit(code);
  }
}
