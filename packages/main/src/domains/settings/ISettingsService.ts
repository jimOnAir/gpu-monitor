import type { ISettings } from '@gpu-monitor/shared';

export interface ISettingsRepository {
  load: () => ISettings;
  save: (settings: ISettings) => boolean;
}
