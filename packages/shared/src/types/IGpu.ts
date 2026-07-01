/**
 * Represents a single GPU as reported by the C agent.
 * Memory and power values are in bytes and milliwatts respectively.
 * Extended fields are optional for backward compatibility with older agents.
 */
export interface IGpu {
  index: number;
  name: string;
  uuid: string;
  coreTemp: number;
  junctionTemp: number;
  vramTemp: number;
  gpuUtilization: number;
  memoryUsed: number;
  memoryTotal: number;
  powerUsage: number;
  coreStatus: 'normal' | 'warning' | 'danger';
  junctionStatus: 'normal' | 'warning' | 'danger';
  vramStatus: 'normal' | 'warning' | 'danger';
  /* Extended metrics (optional for backward compat with older agents) */
  fanSpeed?: number;
  gpuClockMHz?: number;
  memClockMHz?: number;
  tempShutdown?: number;
  tempSlowdown?: number;
  powerCapW?: number;
  driverVersion?: string;
  perfState?: number;
}
