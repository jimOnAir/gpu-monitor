import type { ITrayHandle } from './ITrayHandle';

export interface ITrayMenuItem {
  label?: string;
  click?: () => void;
  type?: 'separator';
}

export interface ITrayFactory {
  create: (icon: unknown) => ITrayHandle;
  buildContextMenu: (template: ITrayMenuItem[]) => unknown;
  setContextMenu: (tray: ITrayHandle, menu: unknown) => void;
}
