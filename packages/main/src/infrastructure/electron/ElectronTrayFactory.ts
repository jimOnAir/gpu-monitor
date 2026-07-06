import type { MenuItemConstructorOptions } from 'electron';
import { Menu, Tray } from 'electron';

import type { ITrayFactory } from '../../domains/tray/ITrayFactory';

export class ElectronTrayFactory implements ITrayFactory {
  create(icon: Electron.NativeImage): Tray {
    return new Tray(icon);
  }

  buildContextMenu(template: MenuItemConstructorOptions[]): Menu {
    return Menu.buildFromTemplate(template);
  }

  setContextMenu(tray: Tray, menu: Menu): void {
    tray.setContextMenu(menu);
  }
}
