export interface ICrashRecoveryService {
  /** Record a crash timestamp and return true if crash loop threshold reached. */
  recordCrash: () => boolean;
  /** Clear crash log on successful startup. */
  recordStartup: () => void;
  /** Returns the user data directory path for crash log storage. */
  getUserDataPath: () => string;
}
