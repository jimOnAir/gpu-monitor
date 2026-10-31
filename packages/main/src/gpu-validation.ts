import type { IAgentGpuResponse } from '@gpu-monitor/shared';
import { z } from 'zod';

/**
 * Validates GPU data received from remote C/Go agents.
 * A malicious or buggy agent can send malformed data (negative temps, huge memory values, missing fields).
 * This schema ensures only well-formed GPU data flows into notifications and the renderer.
 */

/**
 * Plausible band for junction/VRAM sensor readings: 1°C ≤ t < 255°C.
 * A number outside this band is an implausible reading (stale agent binary emitting
 * 0.0 for a dead register, sub-1°C fixed-point garbage, sentinel values) and is
 * normalized to null — treated as sensor unavailable, never as real data.
 */
const SENSOR_MIN_C = 1;
const SENSOR_MAX_C = 255;

/** Normalize an implausible junction/VRAM reading to null (sensor unavailable). */
export function normalizeSensorTemp(temp: number | null): number | null {
  return temp !== null && temp >= SENSOR_MIN_C && temp < SENSOR_MAX_C ? temp : null;
}

// fallow-ignore-next-line unused-exports — schemas are exported for potential reuse by external validators
export const gpuSchema = z.object({
  index: z.number().int().nonnegative(),
  name: z.string().min(1),
  uuid: z.string().min(1),
  coreTemp: z.number(),
  junctionTemp: z.number().nullable(),
  vramTemp: z.number().nullable(),
  gpuUtilization: z.number().min(0).max(100),
  memoryUsed: z.number().nonnegative(),
  memoryTotal: z.number().nonnegative(),
  powerUsage: z.number().nonnegative(),
  fanSpeed: z.number().min(0).max(100).optional(),
  gpuClockMHz: z.number().positive().optional(),
  memClockMHz: z.number().positive().optional(),
  tempShutdown: z.number().optional(),
  tempSlowdown: z.number().optional(),
  powerCapW: z.number().positive().optional(),
  driverVersion: z.string().optional(),
  perfState: z.number().int().nonnegative().optional(),
  vendor: z.string().optional(),
  model: z.string().optional(),
  partNumber: z.string().optional(),
});

// fallow-ignore-next-line unused-exports — schema is exported for potential reuse by external validators
export const gpuResponseSchema = z.object({
  gpus: z.array(gpuSchema).nonempty(),
  timestamp: z.number().optional(),
  agentVersion: z.string().optional(),
});

/**
 * Validate GPU response from a remote agent. Returns parsed data or null on failure.
 * Junction/VRAM temps outside the plausible band (see `normalizeSensorTemp`)
 * are normalized to null so every downstream consumer sees "sensor unavailable".
 */
export function validateGpuResponse(data: unknown): IAgentGpuResponse | null {
  const result = gpuResponseSchema.safeParse(data);
  if (!result.success) {
    return null;
  }

  for (const gpu of result.data.gpus) {
    gpu.junctionTemp = normalizeSensorTemp(gpu.junctionTemp);
    gpu.vramTemp = normalizeSensorTemp(gpu.vramTemp);
  }

  return result.data;
}
