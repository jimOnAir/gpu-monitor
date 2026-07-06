import type { ISettings } from '@gpu-monitor/shared';

export interface ISettingsRepository {
  load: () => ISettings;
  save: (settings: ISettings) => boolean;
}

export interface ISettingsService {
  load: () => ISettings;
  save: (settings: unknown) => boolean;
}
