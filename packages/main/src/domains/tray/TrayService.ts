import type { ISettings } from '@gpu-monitor/shared';
import type { Tray } from 'electron';

import type { Logger } from '../../logger';
import type { AgentData } from '../polling/AgentData';

import type { IIconLoader } from './IIconLoader';
import type { ITrayFactory } from './ITrayFactory';
import type { ITrayService } from './ITrayService';

export function worstState(
  current: 'normal' | 'warning' | 'critical',
  ...others: Array<'normal' | 'warning' | 'critical'>
): 'normal' | 'warning' | 'critical' {
  for (const s of others) {
    if (s === 'critical') {
      return 'critical';
    }
  }
  if (current === 'warning' || others.includes('warning')) {
    return 'warning';
  }

  return 'normal';
}

export function getTempState(temp: number, thresholds: { warn: number, critical: number }): 'normal' | 'warning' | 'critical' {
  if (temp >= thresholds.critical) {
    return 'critical';
  }
  if (temp >= thresholds.warn) {
    return 'warning';
  }

  return 'normal';
}

export class TrayService implements ITrayService {
  private tray: Tray | null = null;
  private lastTrayState: 'normal' | 'warning' | 'critical' | null = null;

  constructor(
    private readonly logger: Logger,
    private readonly trayFactory: ITrayFactory,
    private readonly iconLoader: IIconLoader,
  ) {}

  createTray(opts: { onShow: () => void, onRefresh: () => void, onOpenSettings: () => void, onExit: () => void }): void {
    const newTray = this.trayFactory.create(this.iconLoader.loadBuildIcon());
    newTray.setToolTip('GPU Monitor');

    const contextMenu = this.trayFactory.buildContextMenu([
      { label: 'Show', click: opts.onShow },
      { label: 'Refresh Agents', click: opts.onRefresh },
      { type: 'separator' },
      { label: 'Settings', click: opts.onOpenSettings },
      { type: 'separator' },
      { label: 'Exit', click: opts.onExit },
    ]);

    this.logger.info({ menuItems: contextMenu.items.length }, 'Context menu built');
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
    let maxState: 'normal' | 'warning' | 'critical' = 'normal';
    const tooltipParts: string[] = [];

    for (const gpus of data.gpus.values()) {
      for (const gpu of gpus) {
        const coreState = getTempState(gpu.coreTemp, settings.thresholds.core);
        const junctionState = getTempState(gpu.junctionTemp, settings.thresholds.junction);
        const vramState = getTempState(gpu.vramTemp, settings.thresholds.vram);
        maxState = worstState(maxState, coreState, junctionState, vramState);
        const coreT = String(gpu.coreTemp);
        const junctionT = String(gpu.junctionTemp);
        const vramT = String(gpu.vramTemp);
        const utilPct = String(gpu.gpuUtilization);
        const watts = String(Math.round(gpu.powerUsage));
        tooltipParts.push(
          `${gpu.name} | ${coreT}/${junctionT}/${vramT}\u00B0C | ${utilPct}% | ${watts}W`,
        );
        if (maxState === 'critical') {
          break;
        }
      }
      if (maxState === 'critical') {
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

  getTray(): Tray | null {
    return this.tray;
  }

  private updateTrayIcon(state: 'normal' | 'warning' | 'critical'): void {
    if (!this.tray) {
      return;
    }
    if (state === this.lastTrayState) {
      return;
    }
    this.lastTrayState = state;
    this.tray.setImage(this.iconLoader.loadIcon(state));
  }
}
