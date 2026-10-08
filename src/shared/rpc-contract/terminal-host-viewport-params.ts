import { z } from 'zod'
import { TerminalHostResizeParams } from './terminal-host-resize-params'
export const TerminalHostViewportParams = TerminalHostResizeParams.extend({
  expectedRendererId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
}).strict()
export const TerminalHostViewportReceipt = z
  .object({
    ptyId: z.string().min(1),
    executionHostId: z.string().min(1),
    rendererId: z.number().int().positive(),
    requested: z
      .object({ cols: z.number().int().min(1).max(1000), rows: z.number().int().min(1).max(1000) })
      .strict(),
    canonicalClaimAccepted: z.boolean(),
    hostResizeEligible: z.boolean(),
    rendererApplied: z.literal(false),
    viewportGeometryVerified: z.literal(false)
  })
  .strict()
  .refine((receipt) => !receipt.hostResizeEligible || receipt.canonicalClaimAccepted)
