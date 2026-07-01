import { ISettings, DEFAULT_SETTINGS } from '@gpu-monitor/shared';
import { SettingsRepository } from './SettingsRepository';

/**
 * SettingsService: in-memory cache with file persistence.
 * Loads defaults on first run, persists changes via repository.
 */
export class SettingsService {
  private settings: ISettings;
  private repository: SettingsRepository;

  constructor(repository?: SettingsRepository) {
    this.repository = repository || new SettingsRepository();
    // Load from file, fall back to defaults
    this.settings = this.repository.read() || { ...DEFAULT_SETTINGS };
  }

  /** Get current settings. Returns a copy to prevent mutation. */
  getSettings(): ISettings {
    return { ...this.settings };
  }

  /** Update settings and persist to disk. */
  updateSettings(partial: Partial<ISettings>): void {
    this.settings = {
      ...this.settings,
      ...partial,
      thresholds: {
        ...this.settings.thresholds,
        ...(partial.thresholds || {}),
      },
      agents: partial.agents || this.settings.agents,
    };
    this.repository.write(this.settings);
  }

  /** Reset to defaults. */
  resetToDefaults(): void {
    this.settings = { ...DEFAULT_SETTINGS };
    this.repository.write(this.settings);
  }
}
