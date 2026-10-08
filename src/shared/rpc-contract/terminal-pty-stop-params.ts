import { z } from 'zod'
import { parseExecutionHostId } from '../execution-host'
import { TerminalHandle } from './terminal-unary-params'

export const TerminalPtyStopParams = TerminalHandle.extend({
  expectedPtyId: z.string().min(1).max(1024),
  expectedIncarnationId: z.string().uuid(),
  expectedExecutionHostId: z.string().refine((value) => {
    const host = parseExecutionHostId(value)
    return Boolean(host && host.kind !== 'runtime')
  }),
  keepHistory: z.boolean(),
  confirm: z.literal(true)
}).strict()
