import { type BrowserWindow } from 'electron';
import windowStateKeeper from 'electron-window-state';

import type { IWindowState, IWindowStatePersister } from '../../domains/windows/IWindowStatePersister';

export class ElectronWindowStatePersister implements IWindowStatePersister {
  private stateKeeper: ReturnType<typeof windowStateKeeper>;

  constructor(
    private readonly options: { defaultWidth: number, defaultHeight: number, file: string },
  ) {
    this.stateKeeper = windowStateKeeper(this.options);
  }

  load(): IWindowState {
    return {
      x: this.stateKeeper.x,
      y: this.stateKeeper.y,
      width: this.stateKeeper.width,
      height: this.stateKeeper.height,
    };
  }

  save(window: BrowserWindow): void {
    this.stateKeeper.manage(window);
  }
}
