/**
 * Menu setup.
 * Handles application menu creation with standard macOS roles and custom items.
 */

import { Menu } from 'electron';

import { createPreferencesWindow, getMainWindow } from './windows';

/** Set the application menu. */
export function setApplicationMenu(): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        role: 'appMenu',
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          {
            label: 'Preferences...',
            accelerator: 'CmdOrCtrl+,',
            click: () => {
              const mainWindow = getMainWindow();
              createPreferencesWindow(mainWindow);
            },
          },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit', label: 'Exit', accelerator: 'CmdOrCtrl+Q' },
        ],
      },
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' },
    ]),
  );
}
