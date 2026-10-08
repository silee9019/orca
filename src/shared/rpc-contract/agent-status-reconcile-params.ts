import { z } from 'zod'
import { AgentStatusDismissParams } from './agent-status-cli-params'

export const AgentStatusReconcileParams = AgentStatusDismissParams.extend({
  terminal: z.string().trim().min(1),
  expectedIncarnationId: z.string().min(1).max(128),
  expectedObservation: z
    .object({
      authorityId: z.string().min(1),
      incarnation: z.number().int().nonnegative(),
      revision: z.number().int().nonnegative()
    })
    .strict(),
  confirm: z.literal(true)
}).strict()
