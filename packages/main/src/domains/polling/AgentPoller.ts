import type { IAgent, IGpu } from '@gpu-monitor/shared';

import { validateGpuResponse } from '../../gpu-validation';
import type { Logger } from '../../logger';

import type { IHttpAdapter } from './IHttpAdapter';

export interface AgentFetchResult {
  gpus: { gpus: IGpu[], timestamp?: number } | null;
  healthOk: boolean;
}

/**
 * Fetches GPU data and health status from a remote C agent via HTTP.
 * Pure data-fetching concern — no state management, no classification logic.
 */
export class AgentPoller {
  constructor(
    private readonly logger: Logger,
    private readonly httpAdapter: IHttpAdapter,
  ) {}

  async fetchAgentData(agent: IAgent): Promise<AgentFetchResult | null> {
    const fetchUrl = `${agent.url}/gpu`;
    const healthUrl = `${agent.url}/health`;
    this.logger.info({ agent: agent.id, fetchUrl, healthUrl }, 'polling agent');

    try {
      const fetchTimeoutMs = 5000;
      const [gpuData, healthData] = await Promise.race([
        Promise.all([
          this.httpAdapter.getJson<{ gpus: IGpu[], timestamp?: number }>(fetchUrl, fetchTimeoutMs),
          this.httpAdapter.getJson<{ status: string }>(healthUrl, fetchTimeoutMs),
        ]),
        new Promise<never>((_, reject) =>
          setTimeout(() => {
            reject(new Error('Fetch timed out'));
          }, fetchTimeoutMs),
        ),
      ]);

      this.logger.info({
        agent: agent.id,
        gpuDataNull: gpuData === null,
        gpuDataGpus: gpuData?.gpus.length,
        healthOk: healthData?.status === 'ok',
      }, 'fetch completed');

      const hasGpus = gpuData !== null && Array.isArray(gpuData.gpus);
      const healthOk = healthData?.status === 'ok';

      return { gpus: hasGpus ? gpuData : null, healthOk };
    } catch (error) {
      this.logger.error({ agent: agent.id, error: String(error) }, 'fetch failed');

      return null;
    }
  }

  /**
   * Classifies raw agent fetch result using validation.
   */
  classifyResult(data: AgentFetchResult | null) {
    if (!data) {
      this.logger.warn('No agent data returned');

      return { status: 'fetch-failed' as const };
    }
    if (!data.gpus) {
      this.logger.warn('No GPU data returned from agent');

      return { status: 'fetch-failed' as const };
    }
    if (!data.healthOk) {
      this.logger.warn('Agent /health endpoint returned non-ok');

      return { status: 'health-failed' as const };
    }
    const validated = validateGpuResponse(data.gpus);
    if (!validated) {
      this.logger.warn('GPU data failed validation — rejecting response');

      return { status: 'fetch-failed' as const };
    }

    return { status: 'ok' as const, gpus: validated };
  }
}
