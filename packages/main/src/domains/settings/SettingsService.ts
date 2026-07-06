import type { ISettings } from '@gpu-monitor/shared';

import type { ISettingsService } from './ISettingsService';
import type { ISettingsRepository } from './ISettingsService';

export class SettingsService implements ISettingsService {
  constructor(private readonly repository: ISettingsRepository) {}

  load(): ISettings {
    return this.repository.load();
  }

  save(settings: unknown): boolean {
    return this.repository.save(settings as ISettings);
  }
}
