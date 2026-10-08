import { z } from 'zod'
import { parseExecutionHostId } from '../execution-host'

export const WorkspaceSessionStateReadParams = z
  .object({
    hostId: z
      .string()
      .refine((value) => parseExecutionHostId(value) !== null, 'Invalid execution host')
      .nullable()
      .optional()
  })
  .strict()
export const WorkspaceSessionStateFlushParams = z.object({ confirm: z.literal(true) }).strict()
