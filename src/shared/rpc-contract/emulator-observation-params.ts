import { z } from 'zod'

export const EmulatorObservationParams = z
  .object({
    worktree: z.string().min(1),
    timeoutMs: z.number().int().min(1).max(60_000).default(10_000)
  })
  .strict()

export const EmulatorStreamStopParams = z.object({ subscriptionId: z.string().min(1) }).strict()
