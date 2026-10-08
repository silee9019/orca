import { z } from 'zod'
import { parseExecutionHostId } from '../execution-host'
import { TERMINAL_INPUT_MAX_BYTES } from '../terminal-input'
import { TerminalHandle } from './terminal-unary-params'

export const TerminalPreviewInputTargetParams = TerminalHandle.extend({
  expectedPtyId: z.string().min(1).max(1024),
  expectedIncarnationId: z.string().min(1).max(256),
  expectedExecutionHostId: z.string().refine((value) => {
    const host = parseExecutionHostId(value)
    return Boolean(host && host.kind !== 'runtime')
  }),
  confirm: z.literal(true)
}).strict()
export const TerminalPreviewInputParams = TerminalPreviewInputTargetParams.extend({
  data: z.string().min(1).max(TERMINAL_INPUT_MAX_BYTES)
}).strict()
