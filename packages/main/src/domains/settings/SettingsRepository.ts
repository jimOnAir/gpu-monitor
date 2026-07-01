import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { ISettings, DEFAULT_SETTINGS } from '@gpu-monitor/shared';

const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings', 'settings.json');

/**
 * SettingsRepository: low-level file I/O for settings.json.
 * Platform-agnostic — no Electron in domain logic.
 */
export class SettingsRepository {
  /**
   * Read settings from disk. Returns null if file doesn't exist or is invalid.
   */
  read(): ISettings | null {
    try {
      if (!fs.existsSync(SETTINGS_FILE)) {
        return null;
      }
      const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      // Basic validation: ensure it has the expected shape
      if (!this.isValidSettings(parsed)) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * Write settings to disk.
   */
  write(settings: ISettings): void {
    const dir = path.dirname(SETTINGS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
  }

  /** Basic shape validation. */
  private isValidSettings(data: unknown): data is ISettings {
    if (!data || typeof data !== 'object') return false;
    const d = data as Record<string, unknown>;
    return (
      Array.isArray(d.agents) &&
      typeof d.refreshInterval === 'number' &&
      d.thresholds &&
      typeof d.thresholds === 'object'
    );
  }
}
