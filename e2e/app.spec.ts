import { test, expect } from '@playwright/test';

/**
 * GPU Monitor E2E Tests
 *
 * These tests verify core application functionality.
 * For full Electron testing, use the Playwright config which launches the actual Electron app.
 */

test.describe('App Structure', () => {
  test('HTML structure is valid', async ({ page }) => {
    // Load the built HTML directly to verify structure
    await page.goto('file://' + process.cwd() + '/packages/renderer/dist/index.html');

    // Check root element exists
    await expect(page.locator('#root')).toBeVisible();

    // Check title
    await expect(page.locator('title')).toHaveText('GPU Monitor');
  });

  test('CSP is configured', async ({ page }) => {
    await page.goto('file://' + process.cwd() + '/packages/renderer/dist/index.html');

    // Check CSP meta tag exists
    const cspMeta = page.locator('meta[http-equiv="Content-Security-Policy"]');
    await expect(cspMeta).toHaveCount(1);
  });

  test('bundle.js is loaded with nonce', async ({ page }) => {
    await page.goto('file://' + process.cwd() + '/packages/renderer/dist/index.html');

    // Check script tag with nonce exists
    const scriptTag = page.locator('script[src="bundle.js"][nonce]');
    await expect(scriptTag).toHaveCount(1);
  });
});

test.describe('CSS Structure', () => {
  test('has required CSS classes', async ({ page }) => {
    await page.goto('file://' + process.cwd() + '/packages/renderer/dist/index.html');

    // Wait for bundle to load and check CSS is applied
    await page.waitForTimeout(100);

    // Check that the app container has expected styles
    const appStyles = await page.evaluate(() => {
      const app = document.querySelector('.app');
      return app ? window.getComputedStyle(app).display : null;
    });

    // The app should be flex (from CSS)
    expect(appStyles).toBe('flex');
  });
});
