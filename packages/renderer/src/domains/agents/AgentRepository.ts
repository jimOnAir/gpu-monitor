import { IGpu } from '@gpu-monitor/shared';
import { logger } from './logger';

const FETCH_TIMEOUT_MS = 5000;

/** Allowed URL protocols for agent endpoints. */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Validate that a URL has an allowed protocol and is well-formed.
 * Returns the base URL (without trailing slash) if valid, throws otherwise.
 */
function validateAgentUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
      throw new Error(`Disallowed protocol: ${url.protocol}`);
    }
    // Strip trailing slash so path joining works: base + '/gpu' => '/gpu' not '//gpu'
    return url.toString().replace(/\/$/, '');
  } catch {
    throw new Error(`Invalid agent URL: ${raw}`);
  }
}

/**
 * AgentRepository: low-level HTTP calls to agent endpoints.
 * Platform-agnostic — works in both browser and Electron renderer.
 */
export class AgentRepository {
  /**
   * Fetch GPU data from a single agent.
   * Returns null on failure (network error, timeout, invalid response).
   */
  async fetchGpus(agentUrl: string): Promise<IGpu[] | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const validatedUrl = validateAgentUrl(agentUrl);
      logger.debug('AgentRepository', undefined, `Fetching GPUs from ${validatedUrl}`);
      const response = await fetch(`${validatedUrl}/gpu`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      // C agent wraps GPUs in {"timestamp": ..., "gpus": [...]}
      // Tolerate both wrapped and raw array formats
      if (Array.isArray(data)) {
        logger.info('AgentRepository', undefined, `Fetched ${data.length} GPU(s) from ${agentUrl}`, { gpuCount: data.length });
        return data as IGpu[];
      }
      if (data && typeof data === 'object' && Array.isArray((data as any).gpus)) {
        logger.info('AgentRepository', undefined, `Fetched ${(data as any).gpus.length} GPU(s) from ${agentUrl}`, { gpuCount: (data as any).gpus.length });
        return (data as any).gpus as IGpu[];
      }
      throw new Error('Invalid response: expected array or {gpus: [...]}');
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        logger.warn('AgentRepository', undefined, `Request timed out: ${agentUrl}`);
        throw new Error('Request timed out');
      }
      logger.error('AgentRepository', undefined, `Fetch failed: ${agentUrl}: ${(err as Error).message}`);
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Health check — quick GET to /health endpoint.
   * Returns true if agent responds.
   */
  async healthCheck(agentUrl: string): Promise<boolean> {
    try {
      const validatedUrl = validateAgentUrl(agentUrl);
      logger.debug('AgentRepository', undefined, `Health check: ${validatedUrl}`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const response = await fetch(`${validatedUrl}/health`, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const ok = response.ok;
      if (!ok) {
        logger.warn('AgentRepository', undefined, `Health check failed: ${agentUrl} (HTTP ${response.status})`);
      }
      return ok;
    } catch (err) {
      logger.error('AgentRepository', undefined, `Health check error: ${agentUrl}: ${(err as Error).message}`);
      return false;
    }
  }
}
