import { Menu } from 'electron';
import type { Menu as ElectronMenu, MenuItemConstructorOptions } from 'electron';

import type { IMenuFactory } from '../../domains/menu/IMenuFactory';

export class ElectronMenuFactory implements IMenuFactory {
  buildFromTemplate(template: MenuItemConstructorOptions[]): ElectronMenu {
    return Menu.buildFromTemplate(template);
  }

  setApplicationMenu(menu: ElectronMenu | null): void {
    Menu.setApplicationMenu(menu);
  }
}
