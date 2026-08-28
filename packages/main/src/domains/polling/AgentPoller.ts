import type { IAgent, IGpu } from '@gpu-monitor/shared';

import { validateGpuResponse } from '../../gpu-validation';
import type { Logger } from '../../logger';

import type { IHttpAdapter } from './IHttpAdapter';

export interface AgentFetchResult {
  gpus: { gpus: IGpu[], timestamp?: number } | null;
  healthOk: boolean;
}

export type ClassifiedResult
  = | { status: 'ok', gpus: { gpus: IGpu[], timestamp?: number } }
  | { status: 'fetch-failed' | 'health-failed' | 'invalid' };

/**
 * Fetches GPU data and health status from a remote C agent via HTTP.
 * Pure data-fetching concern — no state management, no classification logic.
 * Timeout is enforced by the HTTP adapter (IHttpAdapter.getJson).
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

    const [gpuData, healthData] = await Promise.all([
      this.httpAdapter.getJson<{ gpus: IGpu[], timestamp?: number }>(fetchUrl),
      this.httpAdapter.getJson<{ status: string }>(healthUrl),
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
  }

  /**
   * Classifies raw agent fetch result using validation.
   */
  classifyResult(data: AgentFetchResult | null): ClassifiedResult {
    if (!data) {
      this.logger.warn('No agent data returned');

      return { status: 'fetch-failed' };
    }
    if (!data.gpus) {
      this.logger.warn('No GPU data returned from agent');

      return { status: 'fetch-failed' };
    }
    if (!data.healthOk) {
      this.logger.warn('Agent /health endpoint returned non-ok');

      return { status: 'health-failed' };
    }
    const validated = validateGpuResponse(data.gpus);
    if (!validated) {
      this.logger.warn('GPU data failed validation — rejecting response');

      return { status: 'invalid' };
    }

    return { status: 'ok', gpus: validated };
  }
}
