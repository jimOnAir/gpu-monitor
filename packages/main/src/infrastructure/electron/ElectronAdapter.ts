import type { app } from 'electron';
import { nativeImage } from 'electron';
import * as path from 'path';

// Logger type is imported inline below to avoid circular reference issues
import type { IMenuFactory } from '../../domains/menu/IMenuFactory';
import type { INotificationDispatcher } from '../../domains/notifications/INotificationDispatcher';
import type { IIconLoader } from '../../domains/tray/IIconLoader';
import type { ITrayFactory } from '../../domains/tray/ITrayFactory';
import type { IExternalOpener } from '../../domains/windows/IExternalOpener';
import type { IThemeListener } from '../../domains/windows/IThemeListener';
import type { IWindowFactory } from '../../domains/windows/IWindowFactory';
import type { IWindowStatePersister } from '../../domains/windows/IWindowStatePersister';
import type { Logger } from '../../logger';

import type { IHttpAdapter } from './NodeHttpAdapter';

export interface IElectronAdapter {
  appPath: string;
  http: IHttpAdapter;
  notificationDispatcher: INotificationDispatcher;
  trayFactory: ITrayFactory;
  windowFactory: IWindowFactory;
  iconLoader: IIconLoader;
  themeListener: IThemeListener;
  externalOpener: IExternalOpener;
  menuFactory: IMenuFactory;
  buildTrayIcon: () => Electron.NativeImage;
  createWindowStatePersister: (options: { file: string, defaultWidth: number, defaultHeight: number }) => IWindowStatePersister;
}

export class ElectronAdapter implements IElectronAdapter {
  readonly appPath: string;
  readonly http: IHttpAdapter;
  readonly notificationDispatcher: INotificationDispatcher;
  readonly trayFactory: ITrayFactory;
  readonly windowFactory: IWindowFactory;
  readonly iconLoader: IIconLoader;
  readonly themeListener: IThemeListener;
  readonly externalOpener: IExternalOpener;
  readonly menuFactory: IMenuFactory;

  constructor(
    private readonly logger: Logger,
    private readonly electronApp: typeof app,
    http: IHttpAdapter,
    notificationDispatcher: INotificationDispatcher,
    trayFactory: ITrayFactory,
    windowFactory: IWindowFactory,
    iconLoader: IIconLoader,
    themeListener: IThemeListener,
    externalOpener: IExternalOpener,
    menuFactory: IMenuFactory,
  ) {
    this.appPath = this.electronApp.getPath('userData');
    this.http = http;
    this.notificationDispatcher = notificationDispatcher;
    this.trayFactory = trayFactory;
    this.windowFactory = windowFactory;
    this.iconLoader = iconLoader;
    this.themeListener = themeListener;
    this.externalOpener = externalOpener;
    this.menuFactory = menuFactory;
  }

  createWindowStatePersister(options: { file: string, defaultWidth: number, defaultHeight: number }): IWindowStatePersister {
    const { ElectronWindowStatePersister } = require('./ElectronWindowStatePersister');

    return new ElectronWindowStatePersister(options);
  }

  buildTrayIcon(): Electron.NativeImage {
    let iconPath: string;
    if (this.electronApp.isPackaged) {
      iconPath = path.join(__dirname, '../../../..', 'build', 'icons', 'icon.png');
    } else {
      const projectRoot = path.resolve(__dirname, '../../../../');
      iconPath = path.join(projectRoot, 'build', 'icons', 'icon.png');
    }
    const img = nativeImage.createFromPath(iconPath);
    if (img.isEmpty()) {
      this.logger.warn({ iconPath }, 'Build icon not found, using default tray icon');
      return nativeImage.createEmpty();
    }
    this.logger.info({ iconPath, width: img.getSize().width, height: img.getSize().height }, 'Build icon loaded');

    return img.resize({ width: 24, height: 24 });
  }
}
