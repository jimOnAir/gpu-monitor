import type { Menu, MenuItemConstructorOptions } from 'electron';

export interface IMenuFactory {
  buildFromTemplate: (template: MenuItemConstructorOptions[]) => Menu;
  setApplicationMenu: (menu: Menu | null) => void;
}
