/**
 * Playwright configuration for GPU Monitor E2E tests.
 * Tests the main Electron window lifecycle, IPC communication, and UI interactions.
 */

import { defineConfig } from '@playwright/test';
import { spawn } from 'child_process';
import { join } from 'path';

const APP_DIR = join(__dirname, '..');

const startApp = () => {
  // Build the app first
  spawn('npm', ['run', 'build'], {
    cwd: APP_DIR,
    stdio: 'ignore',
  });

  // Start the Electron app
  const proc = spawn('electron', ['packages/main/dist/electron-app/main.js'], {
    cwd: APP_DIR,
    stdio: 'ignore',
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' },
  });

  return proc;
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'electron',
      use: {
        headless: true,
        viewport: { width: 1280, height: 720 },
      },
    },
  ],
  // Launch Electron app before tests, tear down after
  globalSetup: async (config) => {
    const appProcess = startApp();
    // Wait for app to load
    await new Promise((resolve) => setTimeout(resolve, 5000));
    (config as any).globalSetupComplete = { appProcess };
    return { appProcess };
  },
  globalTeardown: async () => {
    // Teardown is handled in the test file
  },
});
