import { nativeTheme } from 'electron';

import type { IThemeListener, ThemeColor } from '../../domains/windows/IThemeListener';

export class ElectronThemeListener implements IThemeListener {
  private callbacks: Array<(color: ThemeColor) => void> = [];

  subscribe(callback: (color: ThemeColor) => void): void {
    this.callbacks.push(callback);
  }

  getCurrentColor(): ThemeColor {
    return nativeTheme.shouldUseDarkColors ? '#1E2733' : '#FFFFFF';
  }

  start(): void {
    nativeTheme.on('updated', () => {
      const color = this.getCurrentColor();
      for (const cb of this.callbacks) {
        cb(color);
      }
    });
  }
}
