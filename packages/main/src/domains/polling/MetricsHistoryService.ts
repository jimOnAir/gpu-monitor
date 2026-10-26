import type { IGpu, IGpuAverages, IMetricWindows } from '@gpu-monitor/shared';

const WINDOW_MS = { m1: 60_000, m5: 300_000, m10: 600_000 } as const;
const MAX_WINDOW_MS = WINDOW_MS.m10;

type MetricKey = keyof IGpuAverages;

const METRIC_KEYS = [
  'coreTemp',
  'junctionTemp',
  'vramTemp',
  'gpuUtilization',
  'memoryUsed',
  'powerUsage',
  'fanSpeed',
  'gpuClockMHz',
  'memClockMHz',
] as const satisfies readonly MetricKey[];

interface StoredSample {
  timestampMs: number;
  values: Partial<Record<MetricKey, number | null>>;
}

function toSample(gpu: IGpu): StoredSample['values'] {
  return {
    coreTemp: gpu.coreTemp,
    junctionTemp: gpu.junctionTemp,
    vramTemp: gpu.vramTemp,
    gpuUtilization: gpu.gpuUtilization,
    memoryUsed: gpu.memoryUsed,
    powerUsage: gpu.powerUsage,
    fanSpeed: gpu.fanSpeed ?? null,
    gpuClockMHz: gpu.gpuClockMHz ?? null,
    memClockMHz: gpu.memClockMHz ?? null,
  };
}

function nullWindows(): IMetricWindows {
  return { m1: null, m5: null, m10: null };
}

function nullAverages(): IGpuAverages {
  return {
    coreTemp: nullWindows(),
    junctionTemp: nullWindows(),
    vramTemp: nullWindows(),
    gpuUtilization: nullWindows(),
    memoryUsed: nullWindows(),
    powerUsage: nullWindows(),
    fanSpeed: nullWindows(),
    gpuClockMHz: nullWindows(),
    memClockMHz: nullWindows(),
  };
}

/**
 * In-memory rolling history of GPU metric samples with 1/5/10-minute
 * window averages. Samples are recorded only on successful poll results;
 * when an agent goes stale/offline no samples arrive, so the last computed
 * averages freeze. Nothing is persisted across app restarts.
 */
export class MetricsHistoryService {
  /** agentId -> gpu index -> samples, oldest first, pruned to MAX_WINDOW_MS */
  private readonly samples = new Map<string, Map<number, StoredSample[]>>();
  /** agentId -> timestamp of the most recent recorded sample */
  private readonly latestTimestamp = new Map<string, number>();

  record(agentId: string, gpus: IGpu[], timestampMs: number): void {
    let byIndex = this.samples.get(agentId);
    if (!byIndex) {
      byIndex = new Map();
      this.samples.set(agentId, byIndex);
    }
    const cutoff = timestampMs - MAX_WINDOW_MS;
    for (const gpu of gpus) {
      let list = byIndex.get(gpu.index);
      if (!list) {
        list = [];
        byIndex.set(gpu.index, list);
      }
      list.push({ timestampMs, values: toSample(gpu) });
      while (list.length > 0 && list[0].timestampMs < cutoff) {
        list.shift();
      }
    }

    this.latestTimestamp.set(agentId, timestampMs);
  }

  /** Position-aligned with `gpus`; a GPU with no history yields all-null windows. */
  getAverages(agentId: string, gpus: IGpu[]): IGpuAverages[] {
    const byIndex = this.samples.get(agentId);
    const latest = this.latestTimestamp.get(agentId);

    return gpus.map((gpu) => {
      if (latest === undefined) {
        return nullAverages();
      }
      const list = byIndex?.get(gpu.index);
      if (!list || list.length === 0) {
        return nullAverages();
      }
      const result = nullAverages();
      for (const key of METRIC_KEYS) {
        result[key] = {
          m1: meanInWindow(list, latest, WINDOW_MS.m1, key),
          m5: meanInWindow(list, latest, WINDOW_MS.m5, key),
          m10: meanInWindow(list, latest, WINDOW_MS.m10, key),
        };
      }

      return result;
    });
  }

  reset(): void {
    this.samples.clear();
    this.latestTimestamp.clear();
  }
}

function meanInWindow(
  list: StoredSample[],
  latestMs: number,
  windowMs: number,
  key: MetricKey,
): number | null {
  const from = latestMs - windowMs;
  let sum = 0;
  let count = 0;
  for (const sample of list) {
    if (sample.timestampMs < from) {
      continue;
    }
    const value = sample.values[key];
    if (value === null || value === undefined) {
      continue;
    }
    sum += value;
    count += 1;
  }

  return count === 0 ? null : sum / count;
}
