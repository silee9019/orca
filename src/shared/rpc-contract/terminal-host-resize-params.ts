import { z } from 'zod'
import { TerminalPtyInputTargetParams } from './terminal-pty-input-params'
const size = z
  .object({ cols: z.number().int().min(1).max(1000), rows: z.number().int().min(1).max(1000) })
  .strict()
export const TerminalHostResizeParams = TerminalPtyInputTargetParams.extend(size.shape).strict()
export const TerminalHostResizeReceipt = z
  .object({
    ptyId: z.string().min(1),
    executionHostId: z.string().min(1),
    requested: size,
    providerCallReturned: z.boolean(),
    providerApplied: z.boolean(),
    rendererApplied: z.literal(false),
    applied: size.nullable(),
    reason: z
      .enum([
        'suppressed',
        'remotely-driven',
        'provider-unavailable',
        'provider-failed',
        'unconfirmed'
      ])
      .optional()
  })
  .strict()
  .refine(
    (receipt) =>
      !receipt.providerApplied ||
      (receipt.providerCallReturned &&
        receipt.applied?.cols === receipt.requested.cols &&
        receipt.applied.rows === receipt.requested.rows &&
        receipt.reason === undefined)
  )
