/**
 * Represents a single GPU as reported by the C agent.
 * Memory is in bytes; power is in watts (C agent converts mW to W before sending).
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
  coreStatus?: 'normal' | 'warning' | 'danger';
  junctionStatus?: 'normal' | 'warning' | 'danger';
  vramStatus?: 'normal' | 'warning' | 'danger';
  /* Extended metrics (optional for backward compat with older agents) */
  fanSpeed?: number;
  gpuClockMHz?: number;
  memClockMHz?: number;
  tempShutdown?: number;
  tempSlowdown?: number;
  powerCapW?: number;
  driverVersion?: string;
  perfState?: number;
  /* Board identity (optional, for backward compatibility with older agents) */
  vendor?: string;
  model?: string;
  partNumber?: string;
}
