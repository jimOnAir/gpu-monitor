import { evaluateStatus, worstStatus, type ISettings, type MetricStatus } from '@gpu-monitor/shared';

import type { Logger } from '../../logger';
import type { AgentData } from '../polling/AgentData';

import type { IIconLoader } from './IIconLoader';
import type { ITrayFactory } from './ITrayFactory';
import type { ITrayHandle } from './ITrayHandle';
import type { ITrayService } from './ITrayService';

// Asset filenames use "critical" where the status vocabulary says "danger".
const ICON_FILE_FOR_STATE: Record<MetricStatus, string> = {
  normal: 'normal',
  warning: 'warning',
  danger: 'critical',
};

export class TrayService implements ITrayService {
  private tray: ITrayHandle | null = null;
  private lastTrayState: MetricStatus | null = null;

  constructor(
    private readonly logger: Logger,
    private readonly trayFactory: ITrayFactory,
    private readonly iconLoader: IIconLoader,
  ) {}

  createTray(opts: { onShow: () => void, onRefresh: () => void, onOpenSettings: () => void, onExit: () => void }): void {
    const newTray = this.trayFactory.create(this.iconLoader.loadBuildIcon());
    newTray.setToolTip('GPU Monitor');

    const menuTemplate: Array<{ label?: string, click?: () => void, type?: 'separator' }> = [
      { label: 'Show', click: opts.onShow },
      { label: 'Refresh Agents', click: opts.onRefresh },
      { type: 'separator' },
      { label: 'Settings', click: opts.onOpenSettings },
      { type: 'separator' },
      { label: 'Exit', click: opts.onExit },
    ];

    const contextMenu = this.trayFactory.buildContextMenu(menuTemplate);
    this.logger.info({ menuItems: menuTemplate.length }, 'Context menu built');
    this.trayFactory.setContextMenu(newTray, contextMenu);

    // Left-click toggles window visibility (matches original behavior)
    newTray.on('click', () => {
      this.logger.info('Tray clicked — toggling window');
      opts.onShow();
    });

    // Double-click: show window directly
    newTray.on('double-click', () => {
      this.logger.info('Tray double-clicked — showing window');
      opts.onShow();
    });

    this.logger.info('Tray created successfully with menu');
    this.tray = newTray;
  }

  updateTrayFromData(data: AgentData, settings: ISettings): void {
    if (!this.tray) {
      return;
    }
    let maxState: MetricStatus = 'normal';
    const tooltipParts: string[] = [];

    for (const gpus of data.gpus.values()) {
      for (const gpu of gpus) {
        const coreState = evaluateStatus(gpu.coreTemp, settings.thresholds.core.warn, settings.thresholds.core.critical);
        const junctionState = evaluateStatus(gpu.junctionTemp, settings.thresholds.junction.warn, settings.thresholds.junction.critical);
        const vramState = evaluateStatus(gpu.vramTemp, settings.thresholds.vram.warn, settings.thresholds.vram.critical);
        maxState = worstStatus(maxState, coreState, junctionState, vramState);
        const coreT = String(gpu.coreTemp);
        const junctionT = String(gpu.junctionTemp);
        const vramT = String(gpu.vramTemp);
        const utilPct = String(gpu.gpuUtilization);
        const watts = String(Math.round(gpu.powerUsage));
        tooltipParts.push(
          `${gpu.name} | ${coreT}/${junctionT}/${vramT}\u00B0C | ${utilPct}% | ${watts}W`,
        );
        if (maxState === 'danger') {
          break;
        }
      }
      if (maxState === 'danger') {
        break;
      }
    }

    this.updateTrayIcon(maxState);

    if (tooltipParts.length > 0) {
      this.tray.setToolTip(`GPU Monitor\n${tooltipParts.join('\n')}`);
    } else {
      this.tray.setToolTip('GPU Monitor');
    }
  }

  getTray(): ITrayHandle | null {
    return this.tray;
  }

  private updateTrayIcon(state: MetricStatus): void {
    if (!this.tray) {
      return;
    }
    if (state === this.lastTrayState) {
      return;
    }
    this.lastTrayState = state;
    this.tray.setImage(this.iconLoader.loadIcon(ICON_FILE_FOR_STATE[state]));
  }
}
