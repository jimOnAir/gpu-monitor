/**
 * Rolling 1/5/10-minute averages for a single metric, computed app-side
 * (main process) from stored poll samples. Units match `IGpu` raw values
 * (memoryUsed in bytes, power in watts, clocks in MHz). A null window
 * means no samples with a non-null value fell inside it.
 */
export interface IMetricWindows {
  m1: number | null;
  m5: number | null;
  m10: number | null;
}

/**
 * Per-GPU rolling averages for the time-varying metrics only.
 * Constants (memoryTotal, powerCapW, shutdown/slowdown limits) and
 * P-state are excluded — averaging them is meaningless.
 */
export interface IGpuAverages {
  coreTemp: IMetricWindows;
  junctionTemp: IMetricWindows;
  vramTemp: IMetricWindows;
  gpuUtilization: IMetricWindows;
  memoryUsed: IMetricWindows;
  powerUsage: IMetricWindows;
  fanSpeed: IMetricWindows;
  gpuClockMHz: IMetricWindows;
  memClockMHz: IMetricWindows;
}
