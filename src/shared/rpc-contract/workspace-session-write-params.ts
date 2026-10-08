import { z } from 'zod'
import { parseExecutionHostId } from '../execution-host'

export const WorkspaceSessionWriteParams = z
  .object({
    hostId: z.string().refine((value) => parseExecutionHostId(value) !== null, 'Invalid host'),
    expected: z.unknown(),
    next: z.unknown(),
    confirm: z.literal(true)
  })
  .strict()
