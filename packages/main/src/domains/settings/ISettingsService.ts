import type { Settings } from '../notifications/INotificationService';

export interface ISettingsRepository {
  load: () => Settings | null;
  save: (settings: Settings) => boolean;
}

export interface ISettingsService {
  load: () => Settings;
  save: (settings: unknown) => boolean;
}
