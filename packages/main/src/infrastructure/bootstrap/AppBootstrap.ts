import type { ISettings } from '@gpu-monitor/shared';
import type { AgentData } from '@gpu-monitor/shared';
import type { BrowserWindow } from 'electron';
import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'path';

import type { ICrashRecoveryService } from '../../domains/ICrashRecoveryService';
import type { INotificationService } from '../../domains/notifications/INotificationService';
import { NotificationService } from '../../domains/notifications/NotificationService';
import { NotificationTextFormatter } from '../../domains/notifications/NotificationTextFormatter';
import { TemperatureEvaluator } from '../../domains/notifications/TemperatureEvaluator';
import { AgentPoller } from '../../domains/polling/AgentPoller';
import type { IPollingService } from '../../domains/polling/IPollingService';
import { PollingService } from '../../domains/polling/PollingService';
import { StaleDetector } from '../../domains/polling/StaleDetector';
import type { ISettingsRepository } from '../../domains/settings/ISettingsService';
import { SettingsRepository } from '../../domains/settings/SettingsRepository';
import type { ITrayService } from '../../domains/tray/ITrayService';
import { TrayService } from '../../domains/tray/TrayService';
import type { IWindowService } from '../../domains/windows/IWindowService';
import { NavigationSecurityService } from '../../domains/windows/NavigationSecurityService';
import { WindowService } from '../../domains/windows/WindowService';
import { IpcHandler } from '../../IpcHandler';
import type { Logger } from '../../logger';
import { MenuService } from '../../MenuService';
import type { ElectronAdapter } from '../electron/ElectronAdapter';

export class AppBootstrap {
  private settingsRepository!: ISettingsRepository;
  private notificationService!: INotificationService;
  private trayService!: ITrayService;
  private windowService!: IWindowService;
  private pollingService!: IPollingService;
  private menuService!: MenuService;
  private _crashRecovery!: ICrashRecoveryService;

  constructor(
    private readonly logger: Logger,
    private readonly electronAdapter: ElectronAdapter,
  ) {}

  initialize(): void {
    this.wireServices();

    const settings = this.settingsRepository.load();

    const isCrashLoop = this._crashRecovery.recordCrash();
    if (isCrashLoop) {
      void this.showRecoveryDialog();

      return;
    }
    this._crashRecovery.recordStartup();

    this.setupUx(settings);
    this.setupLifecycle();
  }

  private wireServices(): void {
    const crashRecovery = this.electronAdapter.crashRecovery;
    this.settingsRepository = new SettingsRepository(this.logger, this.electronAdapter.appPath, this.electronAdapter.fileStorage);

    this.trayService = new TrayService(
      this.logger,
      this.electronAdapter.trayFactory,
      this.electronAdapter.iconLoader,
    );

    this.windowService = new WindowService(
      this.logger,
      this.electronAdapter.windowFactory,
      () => this.electronAdapter.buildTrayIcon(),
      new NavigationSecurityService(this.electronAdapter.externalOpener),
      this.electronAdapter.themeListener,
      this.electronAdapter.createWindowStatePersister({ file: 'main-window-state.json', defaultWidth: 720, defaultHeight: 800 }),
      this.electronAdapter.createWindowStatePersister({ file: 'preferences-window-state.json', defaultWidth: 600, defaultHeight: 500 }),
      this.electronAdapter.projectRoot,
    );

    this.notificationService = new NotificationService(
      this.logger,
      this.electronAdapter.notificationDispatcher,
      new TemperatureEvaluator(),
      new NotificationTextFormatter(),
    );

    const agentPoller = new AgentPoller(this.logger, this.electronAdapter.http);
    const staleDetector = new StaleDetector();
    this.pollingService = new PollingService(
      this.logger,
      this.electronAdapter.http,
      this.settingsRepository,
      this.notificationService,
      this.trayService,
      this.windowService,
      agentPoller,
      staleDetector,
    );

    const ipcHandler = new IpcHandler(
      this.settingsRepository,
      this.pollingService,
      this.windowService,
      this.logger,
    );
    ipcHandler.register();

    this.menuService = new MenuService(this.windowService, this.electronAdapter.menuFactory);
    this.menuService.register();

    this._crashRecovery = crashRecovery;
  }

  private setupUx(settings: ISettings): void {
    this.trayService.createTray({
      onShow: () => {
        this.logger.info({ windowExists: !!this.windowService.getMainWindow() }, 'Tray: Show clicked');
        const win = this.windowService.getMainWindow();
        if (win) {
          win.show();
        } else {
          this.logger.warn('No main window found to show');
        }
      },
      onRefresh: () => {
        this.logger.info('Tray: Refresh clicked');
        this.refreshAgents(settings);
      },
      onOpenSettings: () => {
        this.logger.info('Tray: Open settings clicked');
        this.openPreferences();
      },
      onExit: () => {
        this.logger.info('Tray: Exit clicked — quitting app');
        this.pollingService.stopPolling();
        const win = this.windowService.getMainWindow();
        if (win) {
          win.close();
        }
        app.quit();
      },
    });
    this.logger.info('Tray created successfully with menu');

    this.windowService.createMainWindow(settings, this.trayService.getTray());

    this.pollingService.registerHandlers({
      pushToRenderer: () => {
        this.pushToRenderer();
      },
      evaluateAndNotify: (data: AgentData, notifySettings: ISettings) => {
        this.notificationService.evaluateAndNotify(data, notifySettings);
      },
      updateTrayFromData: () => {
        this.trayService.updateTrayFromData(this.pollingService.getAgentData(), settings);
      },
    });

    this.electronAdapter.themeListener.start();

    const mainWindow = this.windowService.getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.on('did-finish-load', () => {
        this.logger.info('Renderer loaded — starting polling');
        this.pollingService.startPolling(settings);
      });
    }
  }

  private setupLifecycle(): void {
    const mainWindow = this.windowService.getMainWindow();
    this.initializeAutoUpdater(mainWindow);

    app.on('second-instance', () => {
      this.logger.info('Second instance attempted — focusing existing window');
      const mainWin = this.windowService.getMainWindow();
      if (mainWin) {
        if (mainWin.isMinimized()) {
          mainWin.restore();
        }
        mainWin.show();
        mainWin.focus();
      }
    });

    app.on('activate', () => {
      if (!this.windowService.getMainWindow()) {
        this.windowService.createMainWindow(this.settingsRepository.load(), this.trayService.getTray());
      }
    });

    app.on('before-quit', () => {
      this.windowService.setWillQuit(true);
      this.pollingService.stopPolling();
    });
  }

  private refreshAgents(settings: ISettings): void {
    void this.pollingService.refreshAllAgents().then(() => {
      this.notificationService.evaluateAndNotify(this.pollingService.getAgentData(), settings);
      this.trayService.updateTrayFromData(this.pollingService.getAgentData(), settings);
      this.pushToRenderer();
    });
  }

  private pushToRenderer(): void {
    this.windowService.pushToRenderer(this.pollingService.getAgentData());
  }

  private openPreferences(): void {
    this.windowService.togglePreferencesWindow();
  }

  private initializeAutoUpdater(mainWindow: BrowserWindow | null): void {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => {
      this.logger.info('Checking for updates...');
    });

    autoUpdater.on('update-available', (info) => {
      this.logger.info(`Update available: ${info.version}`);
      mainWindow?.webContents.send('UPDATE_AVAILABLE', { version: info.version, releaseNotes: info.releaseNotes });
    });

    autoUpdater.on('update-downloaded', (info) => {
      this.logger.info(`Update downloaded: ${info.version}`);
      mainWindow?.webContents.send('UPDATE_DOWNLOADED', { version: info.version });
    });

    autoUpdater.on('error', (err) => {
      this.logger.warn({ err: err.message }, 'Auto-update error');
    });

    setImmediate(() => {
      autoUpdater.checkForUpdates();
    });
  }

  private async showRecoveryDialog(): Promise<void> {
    this.logger.warn('Crash loop detected — showing recovery dialog');
    const mainWindow = this.windowService.getMainWindow();
    if (!mainWindow) {
      this.logger.error('Main window not available for recovery dialog');
      app.quit();

      return;
    }

    const { dialog } = await import('electron');
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'GPU Monitor',
      message: 'The app crashed multiple times on startup.',
      detail: 'Would you like to reset settings and restart?',
      buttons: ['Reset & Restart', 'Quit'],
      defaultId: 0,
      cancelId: 1,
    });

    if (result.response === 0) {
      try {
        const settingsFile = path.join(this._crashRecovery.getUserDataPath(), 'settings', 'settings.json');
        if (this.electronAdapter.fileStorage.existsSync(settingsFile)) {
          const backupPath = settingsFile + '.backup.' + String(Date.now());
          this.electronAdapter.fileStorage.renameSync(settingsFile, backupPath);
        }
        this._crashRecovery.recordStartup();
        this.pollingService.stopPolling();
        app.relaunch();
        app.exit(0);
      } catch (err) {
        this.logger.error({ err: String(err) }, 'Recovery failed');
        app.quit();
      }
    } else {
      app.quit();
    }
  }
}
