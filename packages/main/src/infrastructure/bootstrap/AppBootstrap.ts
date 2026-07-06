import type { ISettings } from '@gpu-monitor/shared';
import type { BrowserWindow } from 'electron';
import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as fs from 'fs';
import * as path from 'path';

import type { INotificationService } from '../../domains/notifications/INotificationService';
import { NotificationService } from '../../domains/notifications/NotificationService';
import type { AgentData } from '../../domains/polling/AgentData';
import type { IPollingService } from '../../domains/polling/IPollingService';
import { PollingService } from '../../domains/polling/PollingService';
import type { ISettingsService } from '../../domains/settings/ISettingsService';
import { SettingsRepository } from '../../domains/settings/SettingsRepository';
import { SettingsService } from '../../domains/settings/SettingsService';
import type { ITrayService } from '../../domains/tray/ITrayService';
import { TrayService } from '../../domains/tray/TrayService';
import type { IWindowService } from '../../domains/windows/IWindowService';
import { WindowService } from '../../domains/windows/WindowService';
import { IpcHandler } from '../../IpcHandler';
import logger from '../../logger';
import { MenuService } from '../../MenuService';
import type { ElectronAdapter } from '../electron/ElectronAdapter';

const MAX_CRASH_COUNT = 3;
const CRASH_WINDOW_MS = 30 * 60 * 1000;

export class AppBootstrap {
  private settingsService!: ISettingsService;
  private notificationService!: INotificationService;
  private trayService!: ITrayService;
  private windowService!: IWindowService;
  private pollingService!: IPollingService;
  private menuService!: MenuService;

  constructor(private readonly electronAdapter: ElectronAdapter) {}

  initialize(): void {
    // Wire services and infrastructure first
    this.wireServices();

    const settings = this.settingsService.load();

    // Set up crash recovery
    const isCrashLoop = this.recordCrash();
    if (isCrashLoop) {
      void this.showRecoveryDialog();

      return;
    }
    this.recordStartup();

    // Set up UI and polling
    this.setupUx(settings);

    // Set up lifecycle handlers
    this.setupLifecycle();
  }

  private wireServices(): void {
    // Wire repositories
    const settingsRepository = new SettingsRepository(logger, this.electronAdapter.appPath);
    this.settingsService = new SettingsService(settingsRepository);

    // Wire domain services (in dependency order)
    this.trayService = new TrayService(
      logger,
      this.electronAdapter.trayFactory,
      this.electronAdapter.iconLoader,
    );
    this.windowService = new WindowService(
      logger,
      this.electronAdapter.windowFactory,
      () => this.electronAdapter.buildTrayIcon(),
      this.electronAdapter.externalOpener,
      this.electronAdapter.themeListener,
      this.electronAdapter.createWindowStatePersister({ file: 'main-window-state.json', defaultWidth: 720, defaultHeight: 800 }),
      this.electronAdapter.createWindowStatePersister({ file: 'preferences-window-state.json', defaultWidth: 600, defaultHeight: 500 }),
    );
    this.notificationService = new NotificationService(logger, this.electronAdapter.notificationDispatcher);

    // Wire polling (depends on all other services)
    this.pollingService = new PollingService(
      logger,
      this.electronAdapter.http,
      this.settingsService,
      this.notificationService,
      this.trayService,
      this.windowService,
    );

    // Wire infrastructure (takes services via constructor)
    const ipcHandler = new IpcHandler(
      this.settingsService,
      this.pollingService,
      this.windowService,
      logger,
    );
    ipcHandler.register();

    this.menuService = new MenuService(this.windowService, this.electronAdapter.menuFactory);
    this.menuService.register();
  }

  private setupUx(settings: ISettings): void {
    // Create tray
    this.trayService.createTray({
      onShow: () => {
        logger.info({ windowExists: !!this.windowService.getMainWindow() }, 'Tray: Show clicked');
        const win = this.windowService.getMainWindow();
        if (win) {
          logger.info('Showing window');
          win.show();
        } else {
          logger.warn('No main window found to show');
        }
      },
      onRefresh: () => {
        logger.info('Tray: Refresh clicked');
        this.refreshAgents(settings);
      },
      onOpenSettings: () => {
        logger.info('Tray: Open settings clicked');
        this.openPreferences();
      },
      onExit: () => {
        logger.info('Tray: Exit clicked — quitting app');
        this.pollingService.stopPolling();
        const win = this.windowService.getMainWindow();
        if (win) {
          win.close();
        }
        app.quit();
      },
    });
    logger.info('Tray created successfully with menu');

    // Create main window
    this.windowService.createMainWindow(settings, this.trayService.getTray());

    // Register polling callbacks
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

    // Start theme listener (must be before window creation for initial background)
    this.electronAdapter.themeListener.start();

    // Wait for renderer to be ready before starting polling
    const mainWindow = this.windowService.getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.on('did-finish-load', () => {
        logger.info('Renderer loaded — starting polling');
        this.pollingService.startPolling(settings);
      });
    }
  }

  private setupLifecycle(): void {
    const mainWindow = this.windowService.getMainWindow();

    // Auto-update
    this.initializeAutoUpdater(mainWindow);

    // Second-instance handler
    app.on('second-instance', () => {
      logger.info('Second instance attempted — focusing existing window');
      const mainWin = this.windowService.getMainWindow();
      if (mainWin) {
        if (mainWin.isMinimized()) {
          mainWin.restore();
        }
        mainWin.show();
        mainWin.focus();
      }
    });

    // Activate: recreate window if needed
    app.on('activate', () => {
      if (!this.windowService.getMainWindow()) {
        // Settings will be reloaded from repository
        this.windowService.createMainWindow(this.settingsService.load(), this.trayService.getTray());
      }
    });

    // Before quit: notify window service
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
    this.windowService.createPreferencesWindow(this.windowService.getMainWindow());
  }

  private initializeAutoUpdater(mainWindow: BrowserWindow | null): void {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => {
      logger.info('Checking for updates...');
    });

    autoUpdater.on('update-available', (info) => {
      logger.info(`Update available: ${info.version}`);
      mainWindow?.webContents.send('UPDATE_AVAILABLE', { version: info.version, releaseNotes: info.releaseNotes });
    });

    autoUpdater.on('update-downloaded', (info) => {
      logger.info(`Update downloaded: ${info.version}`);
      mainWindow?.webContents.send('UPDATE_DOWNLOADED', { version: info.version });
    });

    autoUpdater.on('error', (err) => {
      logger.warn({ err: err.message }, 'Auto-update error');
    });

    setImmediate(() => {
      autoUpdater.checkForUpdates();
    });
  }

  private recordCrash(): boolean {
    const crashLogFile = path.join(app.getPath('userData'), 'crash-log.json');
    try {
      let crashes: Array<{ timestamp: number }> = [];
      if (fs.existsSync(crashLogFile)) {
        const raw = fs.readFileSync(crashLogFile, 'utf-8');
        const parsed = JSON.parse(raw) as { crashes?: Array<{ timestamp: number }> };
        crashes = parsed.crashes || [];
      }
      const now = Date.now();
      crashes = crashes.filter((c) => now - c.timestamp < CRASH_WINDOW_MS);
      crashes.push({ timestamp: now });
      fs.writeFileSync(crashLogFile, JSON.stringify({ crashes }, null, 2), { mode: 0o600 });

      return crashes.length >= MAX_CRASH_COUNT;
    } catch {
      return false;
    }
  }

  private recordStartup(): void {
    const crashLogFile = path.join(app.getPath('userData'), 'crash-log.json');
    try {
      fs.writeFileSync(crashLogFile, JSON.stringify({ crashes: [] }, null, 2), { mode: 0o600 });
    } catch {
      // Silently ignore
    }
  }

  private async showRecoveryDialog(): Promise<void> {
    logger.warn('Crash loop detected — showing recovery dialog');
    const mainWindow = this.windowService.getMainWindow();
    if (!mainWindow) {
      logger.error('Main window not available for recovery dialog');
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
        const settingsFile = path.join(app.getPath('userData'), 'settings', 'settings.json');
        if (fs.existsSync(settingsFile)) {
          const backupPath = settingsFile + '.backup.' + String(Date.now());
          fs.renameSync(settingsFile, backupPath);
        }
        const crashLogFile = path.join(app.getPath('userData'), 'crash-log.json');
        fs.writeFileSync(crashLogFile, JSON.stringify({ crashes: [] }, null, 2), { mode: 0o600 });
        this.pollingService.stopPolling();
        app.relaunch();
        app.exit(0);
      } catch (err) {
        logger.error({ err: String(err) }, 'Recovery failed');
        app.quit();
      }
    } else {
      app.quit();
    }
  }
}
