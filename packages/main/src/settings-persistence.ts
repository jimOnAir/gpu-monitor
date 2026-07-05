/**
 * Settings persistence.
 * Handles loading and saving settings to disk.
 */

import { DEFAULT_SETTINGS } from '@gpu-monitor/shared';
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

import logger from './logger';
import type { Settings } from './notification-service';
import { parseSettings } from './settings';

const SETTINGS_DIR = path.join(app.getPath('userData'), 'settings');
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'settings.json');

if (!fs.existsSync(SETTINGS_DIR)) {
  fs.mkdirSync(SETTINGS_DIR, { recursive: true });
}

/** Load settings from disk, merging with defaults for missing fields. */
export function loadSettings(): Settings {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as unknown;
      const validated = parseSettings(parsed);
      if (validated) {
        return { ...DEFAULT_SETTINGS, ...validated };
      }
      logger.warn('Settings file found but invalid — using defaults');
    }
  } catch (err) {
    logger.error({ err: String(err) }, 'Failed to load settings');
  }

  return { ...DEFAULT_SETTINGS };
}

/** Save settings to disk after validating with Zod schema. */
export function saveSettings(settings: unknown): boolean {
  const validated = parseSettings(settings);
  if (!validated) {
    logger.error('Refusing to save invalid settings', undefined, 'settings schema validation failed');

    return false;
  }
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(validated, null, 2), { mode: 0o600, encoding: 'utf-8' });

    return true;
  } catch (err) {
    logger.error({ err: String(err) }, 'Failed to save settings');

    return false;
  }
}
