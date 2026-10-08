import { z } from 'zod'
import { TerminalHandle } from './terminal-unary-params'

export const TerminalHostDetailsParams = TerminalHandle.strict()

export const FloatingTerminalCwdParams = z
  .object({
    path: z.string().optional(),
    requireTrusted: z.boolean().optional()
  })
  .strict()

export const SavedTerminalScrollbackParams = z
  .object({
    ref: z.string().regex(/^v1-[0-9a-f]{32}$/)
  })
  .strict()
