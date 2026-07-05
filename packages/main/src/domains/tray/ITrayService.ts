import type { Tray } from 'electron';

export interface ITrayService {
  createTray: (opts: {
    onShow: () => void,
    onRefresh: () => void,
    onOpenSettings: () => void,
    onExit: () => void,
  }) => void;
  updateTrayFromData: () => void;
  getTray: () => Tray | null;
}
