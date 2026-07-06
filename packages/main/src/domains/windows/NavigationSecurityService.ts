import type { IExternalOpener } from './IExternalOpener';

/**
 * Validates navigation URLs and opens untrusted links in the external browser.
 * Pure security concern — no window management, no IPC, no Electron BrowserWindow.
 */
export class NavigationSecurityService {
  constructor(private readonly externalOpener: IExternalOpener) {}

  buildTrustedOrigins(agents: Array<{ url: string }>): Set<string> {
    const origins = new Set<string>();
    for (const agent of agents) {
      try {
        const parsed = new URL(agent.url);
        origins.add(parsed.origin);
      } catch { /* skip malformed */ }
    }

    return origins;
  }

  /**
   * Check if a URL should be allowed within the Electron webview.
   * Returns true if trusted, false if it should be opened externally.
   */
  isTrustedUrl(url: string, trustedOrigins: Set<string>): boolean {
    try {
      const parsed = new URL(url);

      return trustedOrigins.has(parsed.origin);
    } catch {
      return false;
    }
  }

  /**
   * Handle navigation: open untrusted URLs externally, allow trusted ones.
   */
  handleNavigation(url: string, trustedOrigins: Set<string>): void {
    if (this.isTrustedUrl(url, trustedOrigins)) {
      return;
    }
    this.externalOpener.open(url);
  }
}
