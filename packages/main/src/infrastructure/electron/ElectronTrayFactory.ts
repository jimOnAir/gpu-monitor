import type { Menu, MenuItemConstructorOptions, NativeImage } from 'electron';
import { Menu as ElectronMenu, Tray as ElectronTray } from 'electron';

import type { ITrayFactory, ITrayMenuItem } from '../../domains/tray/ITrayFactory';
import type { ITrayHandle } from '../../domains/tray/ITrayHandle';

export class ElectronTrayFactory implements ITrayFactory {
  create(icon: unknown): ITrayHandle {
    const tray = new ElectronTray(icon as NativeImage);

    return {
      setToolTip: (tooltip: string) => {
        tray.setToolTip(tooltip);
      },
      setImage: (image: unknown) => {
        tray.setImage(image as NativeImage);
      },
      on: (event: 'click' | 'double-click', listener: () => void) => {
        if (event === 'click') {
          tray.on('click', listener);
        } else {
          tray.on('double-click', listener);
        }
      },
      setContextMenu: (menu: unknown) => {
        tray.setContextMenu(menu as Menu);
      },
    };
  }

  buildContextMenu(template: ITrayMenuItem[]): unknown {
    const options: MenuItemConstructorOptions[] = template.map((item) => {
      if (item.type === 'separator') {
        return { type: 'separator' };
      }

      return { label: item.label, click: item.click };
    });

    return ElectronMenu.buildFromTemplate(options);
  }

  setContextMenu(tray: ITrayHandle, menu: unknown): void {
    tray.setContextMenu(menu);
  }
}
