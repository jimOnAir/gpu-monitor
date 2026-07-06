import { DEFAULT_SETTINGS, type ISettings } from '@gpu-monitor/shared';
import * as fs from 'fs';
import * as path from 'path';

import type { Logger } from '../../logger';
import { parseSettings } from '../../settings';

import type { ISettingsRepository } from './ISettingsService';

export class SettingsRepository implements ISettingsRepository {
  private readonly settingsFile: string;

  constructor(
    private readonly logger: Logger,
    settingsDir: string,
  ) {
    this.settingsFile = path.join(settingsDir, 'settings.json');
    if (!fs.existsSync(settingsDir)) {
      fs.mkdirSync(settingsDir, { recursive: true });
    }
  }

  load(): ISettings {
    try {
      if (fs.existsSync(this.settingsFile)) {
        const raw = fs.readFileSync(this.settingsFile, 'utf-8');
        const parsed = JSON.parse(raw) as unknown;
        const validated = parseSettings(parsed);
        if (validated) {
          return { ...DEFAULT_SETTINGS, ...validated };
        }
        this.logger.warn('Settings file found but invalid — using defaults');
      }
    } catch (err) {
      this.logger.error({ err: String(err) }, 'Failed to load settings');
    }

    return { ...DEFAULT_SETTINGS };
  }

  save(settings: ISettings): boolean {
    const validated = parseSettings(settings);
    if (!validated) {
      this.logger.error('Refusing to save invalid settings', undefined, 'settings schema validation failed');

      return false;
    }
    try {
      fs.writeFileSync(this.settingsFile, JSON.stringify(validated, null, 2), { mode: 0o600, encoding: 'utf-8' });

      return true;
    } catch (err) {
      this.logger.error({ err: String(err) }, 'Failed to save settings');

      return false;
    }
  }
}
