import { z } from 'zod'
import { TerminalPreviewInputTargetParams } from './terminal-preview-input-params'

export const TerminalPresentationWaitParams = TerminalPreviewInputTargetParams.omit({
  confirm: true
})
  .extend({
    timeoutMs: z.number().int().min(1).max(30000).default(10000)
  })
  .strict()
