import type { ISettings } from '@gpu-monitor/shared';

import type { Logger } from '../../logger';
import type { AgentData } from '../polling/AgentData';

import type { IThemeListener, ThemeColor } from './IThemeListener';
import type { IWindowFactory } from './IWindowFactory';
import type { IWindowHandle } from './IWindowHandle';
import type { IWindowService } from './IWindowService';
import type { IWindowStatePersister } from './IWindowStatePersister';
import type { NavigationSecurityService } from './NavigationSecurityService';

export interface WindowDefaults {
  main: { width: number, height: number };
  preferences: { width: number, height: number };
}

export class WindowService implements IWindowService {
  private mainWindow: IWindowHandle | null = null;
  private preferencesWindow: IWindowHandle | null = null;
  private willQuit = false;

  constructor(
    private readonly logger: Logger,
    private readonly windowFactory: IWindowFactory,
    private readonly buildIcon: () => unknown,
    private readonly navigationSecurity: NavigationSecurityService,
    private readonly themeListener: IThemeListener,
    private readonly mainWindowStatePersister: IWindowStatePersister,
    private readonly preferencesWindowStatePersister: IWindowStatePersister,
    private readonly projectRoot: string,
    private readonly windowDefaults: WindowDefaults,
  ) {}

  createMainWindow(settings: ISettings): void {
    const mainWindowState = this.mainWindowStatePersister.load();
    const trustedOrigins = this.navigationSecurity.buildTrustedOrigins(settings.agents);

    this.mainWindow = this.windowFactory.create({
      x: mainWindowState.x,
      y: mainWindowState.y,
      width: mainWindowState.width ?? this.windowDefaults.main.width,
      height: mainWindowState.height ?? this.windowDefaults.main.height,
      minWidth: 520,
      minHeight: 400,
      icon: this.buildIcon(),
      loadFile: `${this.projectRoot}/packages/renderer/dist/index.html`,
      onReadyToShow: () => {
        this.mainWindow?.show();
      },
      onFocus: () => {
        this.mainWindow?.send('WINDOW_FOCUS');
      },
      onBlur: () => {
        this.mainWindow?.send('WINDOW_BLUR');
      },
      onClose: (event) => {
        // Save position before hiding — the persister only auto-saves on real close,
        // but we preventDefault to hide instead of close, so we save manually.
        this.mainWindowStatePersister.save(this.mainWindow as IWindowHandle);
        event.preventDefault();
        if (this.willQuit) {
          this.mainWindow = null;

          return;
        }
        this.mainWindow?.hide();
      },
      onWillNavigate: (event, url) => {
        if (!this.navigationSecurity.isTrustedUrl(url, trustedOrigins)) {
          event.preventDefault();
          this.navigationSecurity.handleNavigation(url, trustedOrigins);
        }
      },
      onWindowOpen: (url) => {
        if (this.navigationSecurity.isTrustedUrl(url, trustedOrigins)) {
          return 'allow';
        }
        this.navigationSecurity.handleNavigation(url, trustedOrigins);

        return 'deny';
      },
    });

    this.themeListener.subscribe((color: ThemeColor) => {
      // Background color is applied at creation; live theme changes are a no-op
      // for the main window (documented limitation of the current factory).
      void color;
    });

    this.logger.info('Main window created');
  }

  showMainWindow(): void {
    this.mainWindow?.show();
  }

  hideMainWindow(): void {
    this.mainWindow?.hide();
  }

  getMainWindow(): IWindowHandle | null {
    return this.mainWindow;
  }

  ensureMainWindow(settings: ISettings): void {
    if (this.mainWindow) {
      this.mainWindow.show();
      this.mainWindow.focus();

      return;
    }
    this.createMainWindow(settings);
  }

  togglePreferencesWindow(): void {
    if (this.preferencesWindow) {
      if (this.preferencesWindow.isVisible()) {
        this.preferencesWindow.hide();
        this.preferencesWindow = null;
      } else {
        this.preferencesWindow.show();
        this.preferencesWindow.focus();
      }

      return;
    }

    this.createPreferencesWindow();
  }

  setWillQuit(value: boolean): void {
    this.willQuit = value;
  }

  pushToRenderer(data: AgentData): void {
    this.mainWindow?.send('GPU_DATA_UPDATE', {
      agents: data.agents,
      gpus: Array.from(data.gpus.entries()).map(([id, gpus]) => ({ agentId: id, gpus })),
      lastUpdate: Array.from(data.lastUpdate.entries()),
      lastFetchTimestamp: Array.from(data.lastFetchTimestamp.entries()),
      statusChangedAt: Array.from(data.statusChangedAt.entries()),
      fetchResult: Array.from(data.fetchResult.entries()),
    });
  }

  private createPreferencesWindow(): void {
    const preferencesWindowState = this.preferencesWindowStatePersister.load();

    this.preferencesWindow = this.windowFactory.create({
      x: preferencesWindowState.x,
      y: preferencesWindowState.y,
      width: preferencesWindowState.width ?? this.windowDefaults.preferences.width,
      height: preferencesWindowState.height ?? this.windowDefaults.preferences.height,
      minWidth: 480,
      minHeight: 400,
      parent: this.mainWindow,
      hasShadow: true,
      roundedCorners: true,
      titleBarStyle: 'hidden',
      loadFile: `${this.projectRoot}/packages/renderer/dist/settings.html`,
      onReadyToShow: () => {
        this.preferencesWindow?.show();
      },
      onFocus: () => {
        this.preferencesWindow?.send('WINDOW_FOCUS');
      },
      onBlur: () => {
        this.preferencesWindow?.send('WINDOW_BLUR');
      },
      onClose: (event) => {
        this.preferencesWindowStatePersister.save(this.preferencesWindow as IWindowHandle);
        event.preventDefault();
        this.preferencesWindow = null;
      },
      onWillNavigate: (event) => {
        event.preventDefault();
      },
      onWindowOpen: () => 'deny',
    });

    this.logger.info('Preferences window created');
  }
}
