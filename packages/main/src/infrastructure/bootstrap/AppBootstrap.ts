import type { ISettings } from '@gpu-monitor/shared';
import type { AgentData } from '@gpu-monitor/shared';

import type { IAppLifecycle } from '../../domains/lifecycle/IAppLifecycle';
import type { IAutoUpdater } from '../../domains/lifecycle/IAutoUpdater';
import { LifecycleService } from '../../domains/lifecycle/LifecycleService';
import type { INotificationService } from '../../domains/notifications/INotificationService';
import { NotificationService } from '../../domains/notifications/NotificationService';
import { AgentPoller } from '../../domains/polling/AgentPoller';
import type { IPollingService } from '../../domains/polling/IPollingService';
import { PollingService } from '../../domains/polling/PollingService';
import { StaleDetector } from '../../domains/polling/StaleDetector';
import type { IDialogAdapter } from '../../domains/recovery/IDialogAdapter';
import { RecoveryService } from '../../domains/recovery/RecoveryService';
import type { ISettingsRepository } from '../../domains/settings/ISettingsService';
import { SettingsRepository } from '../../domains/settings/SettingsRepository';
import type { ITrayService } from '../../domains/tray/ITrayService';
import { TrayService } from '../../domains/tray/TrayService';
import type { IWindowService } from '../../domains/windows/IWindowService';
import { NavigationSecurityService } from '../../domains/windows/NavigationSecurityService';
import { WindowService, type WindowDefaults } from '../../domains/windows/WindowService';
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
  private activeSettings: ISettings | null = null;

  private readonly windowDefaults: WindowDefaults = {
    main: { width: 720, height: 720 },
    preferences: { width: 600, height: 500 },
  };

  constructor(
    private readonly logger: Logger,
    private readonly electronAdapter: ElectronAdapter,
    private readonly appLifecycle: IAppLifecycle,
    private readonly autoUpdater: IAutoUpdater,
    private readonly dialog: IDialogAdapter,
  ) {}

  async initialize(): Promise<void> {
    this.wireServices();

    const recovery = new RecoveryService(
      this.electronAdapter.crashRecovery,
      this.dialog,
      this.settingsRepository,
      () => {
        this.pollingService.stopPolling();
        this.appLifecycle.relaunch();
        this.appLifecycle.exit(0);
      },
      () => {
        this.appLifecycle.quit();
      },
    );

    if (await recovery.handleCrashLoop()) {
      return;
    }
    recovery.recordStartup();

    const settings = this.settingsRepository.load();
    this.activeSettings = settings;
    this.setupUx(settings);

    new LifecycleService(
      this.logger,
      this.appLifecycle,
      this.autoUpdater,
      this.windowService,
      this.pollingService,
      () => this.activeSettings,
    ).register();
  }

  private wireServices(): void {
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
      this.electronAdapter.createWindowStatePersister({ file: 'main-window-state.json', defaultWidth: this.windowDefaults.main.width, defaultHeight: this.windowDefaults.main.height }),
      this.electronAdapter.createWindowStatePersister({ file: 'preferences-window-state.json', defaultWidth: this.windowDefaults.preferences.width, defaultHeight: this.windowDefaults.preferences.height }),
      this.electronAdapter.projectRoot,
      this.windowDefaults,
    );

    this.notificationService = new NotificationService(
      this.logger,
      this.electronAdapter.notificationDispatcher,
    );

    const agentPoller = new AgentPoller(this.logger, this.electronAdapter.http);
    const staleDetector = new StaleDetector();
    this.pollingService = new PollingService(
      this.logger,
      agentPoller,
      staleDetector,
      () => null,
    );

    const ipcHandler = new IpcHandler(
      this.settingsRepository,
      this.pollingService,
      this.windowService,
      this.logger,
    );
    ipcHandler.register();

    const menuService = new MenuService(this.windowService, this.electronAdapter.menuFactory);
    menuService.register();
  }

  private setupUx(settings: ISettings): void {
    this.trayService.createTray({
      onShow: () => {
        this.logger.info('Tray: Show clicked');
        this.windowService.showMainWindow();
      },
      onRefresh: () => {
        this.logger.info('Tray: Refresh clicked');
        void this.pollingService.refreshAgents();
      },
      onOpenSettings: () => {
        this.logger.info('Tray: Open settings clicked');
        this.windowService.togglePreferencesWindow();
      },
      onExit: () => {
        this.logger.info('Tray: Exit clicked — quitting app');
        this.pollingService.stopPolling();
        this.windowService.getMainWindow()?.close();
        this.appLifecycle.quit();
      },
    });

    this.windowService.createMainWindow(settings);

    this.pollingService.registerHandlers({
      pushToRenderer: () => {
        this.windowService.pushToRenderer(this.pollingService.getAgentData());
      },
      evaluateAndNotify: (data: AgentData, notifySettings: ISettings) => {
        this.notificationService.evaluateAndNotify(data, notifySettings);
      },
      updateTrayFromData: () => {
        if (this.activeSettings) {
          this.trayService.updateTrayFromData(this.pollingService.getAgentData(), this.activeSettings);
        }
      },
    });

    this.electronAdapter.themeListener.start();
    this.pollingService.startPolling(settings);
  }
}
