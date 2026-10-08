import { z } from 'zod'
export const TerminalListenerCountParams = z
  .object({
    expectedRuntimeId: z.string().min(1),
    executionHostId: z.literal('local'),
    expectedRendererId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    timeoutMs: z.number().int().min(1).max(10000)
  })
  .strict()
export const TerminalListenerCountReceipt = z
  .object({
    expectedRuntimeId: z.string().min(1),
    executionHostId: z.literal('local'),
    rendererId: z.number().int().positive(),
    count: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    source: z.literal('preload-pty-data-listeners'),
    ptyDeliveryVerified: z.literal(false)
  })
  .strict()
