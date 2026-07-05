#!/usr/bin/env node

/**
 * Notarization script for macOS builds.
 * Called by electron-builder after signing via the `afterSign` hook in package.json.
 *
 * Requires:
 * - APPLE_ID env var
 * - APPLE_ID_PASS env var
 * - APPLE_TEAM_ID env var
 *
 * Usage:
 *   APPLE_ID=you@apple.com APPLE_ID_PASS=app-password APPLE_TEAM_ID=ABC123 npm run package
 */

const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;

  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appName = context.packager.appInfo.productFilename;

  const appId = 'com.gpu-monitor.app';
  const appPath = `${appOutDir}/${appName}.app`;

  if (!process.env.APPLE_ID || !process.env.APPLE_ID_PASS || !process.env.APPLE_TEAM_ID) {
    console.warn('Skipping notarization — missing APPLE_ID, APPLE_ID_PASS, or APPLE_TEAM_ID environment variables');
    return;
  }

  console.log(`Notarizing ${appId} at ${appPath}`);

  try {
    await notarize({
      appBundleId: appId,
      appPath,
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_ID_PASS,
      teamId: process.env.APPLE_TEAM_ID,
    });

    console.log(`  ✓ Notarized ${appId}`);
  } catch (error) {
    console.error(`  ✗ Notarization failed:`, error);
    process.exit(1);
  }
};
