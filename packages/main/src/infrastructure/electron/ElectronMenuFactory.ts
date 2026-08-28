import { Menu } from 'electron';
import type { Menu as ElectronMenu, MenuItemConstructorOptions } from 'electron';

import type { IMenuFactory } from '../../domains/menu/IMenuFactory';

export class ElectronMenuFactory implements IMenuFactory {
  buildFromTemplate(template: unknown): unknown {
    return Menu.buildFromTemplate(template as MenuItemConstructorOptions[]);
  }

  setApplicationMenu(menu: unknown): void {
    Menu.setApplicationMenu(menu as ElectronMenu | null);
  }
}
