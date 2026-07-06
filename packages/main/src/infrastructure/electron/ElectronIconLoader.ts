import type { NativeImage } from 'electron';
import { app, nativeImage } from 'electron';
import * as path from 'path';

import type { IIconLoader } from '../../domains/tray/IIconLoader';
import type { Logger } from '../../logger';

export class ElectronIconLoader implements IIconLoader {
  constructor(private readonly logger: Logger) {}

  loadIcon(name: string): NativeImage {
    const iconPath = path.join(__dirname, '../../assets', `${name}.png`);
    const img = nativeImage.createFromPath(iconPath);
    if (img.isEmpty()) {
      this.logger.warn({ iconPath }, 'Icon file not found or invalid');
    }

    return img;
  }

  loadBuildIcon(resize = false): NativeImage {
    let iconPath: string;
    if (app.isPackaged) {
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

    return resize ? img.resize({ width: 24, height: 24 }) : img;
  }
}
