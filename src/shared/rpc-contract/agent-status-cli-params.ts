import { z } from 'zod'
import { parsePaneKey } from '../stable-pane-id'

export const AgentStatusListParams = z.object({}).strict()
export const AgentStatusDismissParams = z
  .object({
    paneKey: z
      .string()
      .max(512)
      .refine((value) => parsePaneKey(value) !== null, 'Invalid pane key'),
    receivedAt: z.number().finite().nonnegative(),
    stateStartedAt: z.number().finite().nonnegative()
  })
  .strict()
