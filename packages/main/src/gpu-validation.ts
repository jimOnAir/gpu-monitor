import { z } from 'zod';

/**
 * Validates GPU data received from remote C/Go agents.
 * A malicious or buggy agent can send malformed data (negative temps, huge memory values, missing fields).
 * This schema ensures only well-formed GPU data flows into notifications and the renderer.
 */

// fallow-ignore-next-line unused-exports — schemas are exported for potential reuse by external validators
export const gpuSchema = z.object({
  index: z.number().int().nonnegative(),
  name: z.string().min(1),
  uuid: z.string().min(1),
  coreTemp: z.number(),
  junctionTemp: z.number(),
  vramTemp: z.number(),
  gpuUtilization: z.number().min(0).max(100),
  memoryUsed: z.number().nonnegative(),
  memoryTotal: z.number().nonnegative(),
  powerUsage: z.number().nonnegative(),
  coreStatus: z.enum(['normal', 'warning', 'danger']).optional(),
  junctionStatus: z.enum(['normal', 'warning', 'danger']).optional(),
  vramStatus: z.enum(['normal', 'warning', 'danger']).optional(),
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
});

/** Validate GPU response from a remote agent. Returns parsed data or null on failure. */
export function validateGpuResponse(data: unknown): { gpus: z.infer<typeof gpuSchema>[]; timestamp?: number } | null {
  const result = gpuResponseSchema.safeParse(data);
  if (!result.success) {
    return null;
  }

  return result.data;
}
