import { z } from 'zod'
import { TerminalHandle } from './terminal-unary-params'

export const TerminalSignalParams = TerminalHandle.extend({
  signal: z.string().regex(/^SIG[A-Z0-9]{1,24}$/)
}).strict()
