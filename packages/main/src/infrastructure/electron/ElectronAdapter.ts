import type { app } from 'electron';
import * as path from 'path';

import type { ICrashRecoveryService } from '../../domains/ICrashRecoveryService';
import type { IMenuFactory } from '../../domains/menu/IMenuFactory';
import type { INotificationDispatcher } from '../../domains/notifications/INotificationDispatcher';
import type { IHttpAdapter } from '../../domains/polling/IHttpAdapter';
import type { IFileStorage } from '../../domains/settings/IFileStorage';
import type { IIconLoader } from '../../domains/tray/IIconLoader';
import type { ITrayFactory } from '../../domains/tray/ITrayFactory';
import type { IExternalOpener } from '../../domains/windows/IExternalOpener';
import type { IThemeListener } from '../../domains/windows/IThemeListener';
import type { IWindowFactory } from '../../domains/windows/IWindowFactory';
import type { IWindowStatePersister } from '../../domains/windows/IWindowStatePersister';
import type { Logger } from '../../logger';

import { ElectronWindowStatePersister } from './ElectronWindowStatePersister';

export interface IElectronAdapter {
  appPath: string;
  projectRoot: string;
  http: IHttpAdapter;
  notificationDispatcher: INotificationDispatcher;
  trayFactory: ITrayFactory;
  windowFactory: IWindowFactory;
  iconLoader: IIconLoader;
  themeListener: IThemeListener;
  externalOpener: IExternalOpener;
  menuFactory: IMenuFactory;
  crashRecovery: ICrashRecoveryService;
  fileStorage: IFileStorage;
  buildTrayIcon: () => Electron.NativeImage;
  createWindowStatePersister: (options: { file: string, defaultWidth: number, defaultHeight: number }) => IWindowStatePersister;
}

export class ElectronAdapter implements IElectronAdapter {
  readonly appPath: string;
  readonly projectRoot: string;
  readonly http: IHttpAdapter;
  readonly notificationDispatcher: INotificationDispatcher;
  readonly trayFactory: ITrayFactory;
  readonly windowFactory: IWindowFactory;
  readonly iconLoader: IIconLoader;
  readonly themeListener: IThemeListener;
  readonly externalOpener: IExternalOpener;
  readonly menuFactory: IMenuFactory;
  readonly crashRecovery: ICrashRecoveryService;
  readonly fileStorage: IFileStorage;

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
    crashRecovery: ICrashRecoveryService,
    fileStorage: IFileStorage,
  ) {
    this.appPath = this.electronApp.getPath('userData');
    this.projectRoot = path.resolve(__dirname, '../../../../');
    this.http = http;
    this.notificationDispatcher = notificationDispatcher;
    this.trayFactory = trayFactory;
    this.windowFactory = windowFactory;
    this.iconLoader = iconLoader;
    this.themeListener = themeListener;
    this.externalOpener = externalOpener;
    this.menuFactory = menuFactory;
    this.crashRecovery = crashRecovery;
    this.fileStorage = fileStorage;
  }

  createWindowStatePersister(options: { file: string, defaultWidth: number, defaultHeight: number }): IWindowStatePersister {
    return new ElectronWindowStatePersister(options);
  }

  buildTrayIcon(): Electron.NativeImage {
    return this.iconLoader.loadBuildIcon(true);
  }
}
