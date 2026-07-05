/**
 * Tray icon management.
 * Handles tray icon creation, temperature state updates, and tooltip.
 */

import { app, Menu, nativeImage, Tray } from 'electron';
import * as path from 'path';

import logger from './logger';

let tray: Tray | null = null;
let lastTrayState: 'normal' | 'warning' | 'critical' | null = null;

/** Load a tray icon PNG from assets/. */
function loadIcon(name: string): Electron.NativeImage {
  let iconPath: string;
  logger.info({ isPackaged: app.isPackaged, __dirname, resourcesPath: process.resourcesPath }, 'loadIcon debug');
  if (app.isPackaged) {
    iconPath = path.join(__dirname, '../../assets', `${name}.png`);
  } else {
    iconPath = path.join(__dirname, '../../assets', `${name}.png`);
  }
  logger.info({ name, iconPath }, 'loadIcon resolved path');
  const img = nativeImage.createFromPath(iconPath);
  if (img.isEmpty()) {
    logger.warn({ iconPath }, 'Icon file not found or invalid');
  } else {
    logger.info({ name, iconPath, isEmpty: img.isEmpty(), width: img.getSize().width, height: img.getSize().height }, 'Tray icon loaded');
  }

  return img;
}

/** Load the build icon (256x256) and return as NativeImage. */
export function loadBuildIcon(): Electron.NativeImage {
  let iconPath: string;
  if (app.isPackaged) {
    iconPath = path.join(__dirname, '../../../..', 'build', 'icons', 'icon.png');
  } else {
    const projectRoot = path.resolve(__dirname, '../../../../');
    iconPath = path.join(projectRoot, 'build', 'icons', 'icon.png');
  }
  const img = nativeImage.createFromPath(iconPath);
  if (img.isEmpty()) {
    logger.warn({ iconPath }, 'Build icon not found, using default tray icon');

    return nativeImage.createEmpty();
  }
  logger.info({ iconPath, width: img.getSize().width, height: img.getSize().height }, 'Build icon loaded');

  return img;
}

/** Get a resized tray icon from the build icon. */
function getTrayIcon(): Electron.NativeImage {
  const buildIcon = loadBuildIcon();
  if (buildIcon.isEmpty()) {
    return loadIcon('default');
  }

  return buildIcon.resize({ width: 24, height: 24 });
}

/** Get icon by temperature state. */
function getTempIcon(state: 'normal' | 'warning' | 'critical'): Electron.NativeImage {
  if (state === 'critical') {
    return loadIcon('critical');
  }
  if (state === 'warning') {
    return loadIcon('warning');
  }

  return loadIcon('normal');
}

/** Update tray icon only when temperature state changes. */
export function updateTrayIcon(state: 'normal' | 'warning' | 'critical'): void {
  if (!tray) {
    return;
  }
  if (state === lastTrayState) {
    return;
  }
  lastTrayState = state;
  tray.setImage(getTempIcon(state));
}

/** Return the worst of multiple temperature states. */
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

/** Evaluate a single temperature against its thresholds. */
export function getTempState(temp: number, thresholds: { warn: number, critical: number }): 'normal' | 'warning' | 'critical' {
  if (temp >= thresholds.critical) {
    return 'critical';
  }
  if (temp >= thresholds.warn) {
    return 'warning';
  }

  return 'normal';
}

/** Get tray instance. */
export function getTray(): Tray | null {
  return tray;
}

/** Set tray instance. */
export function setTray(newTray: Tray | null): void {
  tray = newTray;
}

/** Create the system tray icon. */
export function createTray(): Tray {
  const newTray = new Tray(getTrayIcon());
  newTray.setToolTip('GPU Monitor');

  return newTray;
}

/** Set the tray context menu. */
export function setTrayContextMenu(tray: Tray, opts: {
  onShow: () => void,
  onRefresh: () => void,
  onOpenSettings: () => void,
  onExit: () => void,
}): void {
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show',
      click: opts.onShow,
    },
    {
      label: 'Refresh Agents',
      click: opts.onRefresh,
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: opts.onOpenSettings,
    },
    { type: 'separator' },
    {
      label: 'Exit',
      click: opts.onExit,
    },
  ]);

  tray.setContextMenu(contextMenu);
}
