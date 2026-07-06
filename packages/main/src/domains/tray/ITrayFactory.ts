import type { MenuItemConstructorOptions, Menu, Tray } from 'electron';

export interface ITrayFactory {
  create: (icon: Electron.NativeImage) => Tray;
  buildContextMenu: (template: MenuItemConstructorOptions[]) => Menu;
  setContextMenu: (tray: Tray, menu: Menu) => void;
}
