import type { IMenuFactory } from './domains/menu/IMenuFactory';
import type { IWindowService } from './domains/windows/IWindowService';

export class MenuService {
  constructor(
    private readonly windowService: IWindowService,
    private readonly menuFactory: IMenuFactory,
  ) {}

  register(): void {
    this.menuFactory.setApplicationMenu(
      this.menuFactory.buildFromTemplate([
        {
          role: 'appMenu',
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            {
              label: 'Preferences...',
              accelerator: 'CmdOrCtrl+,',
              click: () => {
                this.windowService.createPreferencesWindow(this.windowService.getMainWindow());
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
}
