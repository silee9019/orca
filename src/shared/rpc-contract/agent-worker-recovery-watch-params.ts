import { z } from 'zod'
import { MAX_TIMER_DELAY_MS } from '../timer-delay'
import { AgentStatusDismissParams } from './agent-status-cli-params'

const scope = z.object({
  paneKeys: z
    .array(AgentStatusDismissParams.shape.paneKey)
    .min(1)
    .max(128)
    .refine((values) => new Set(values).size === values.length)
})
export const AgentWorkerRecoveryWatchRequest = scope
  .extend({ watchMs: z.number().int().min(1).max(MAX_TIMER_DELAY_MS) })
  .strict()
export const AgentWorkerRecoverySubscriptionParams = scope
  .extend({ subscriptionId: z.string().uuid() })
  .strict()
export type AgentWorkerRecoverySubscriptionParams = z.output<
  typeof AgentWorkerRecoverySubscriptionParams
>
const sequence = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const AgentWorkerRecoveryStreamFrame = z.union([
  scope.extend({ type: z.literal('ready'), sequence: z.literal(0) }).strict(),
  z
    .object({
      type: z.literal('event'),
      sequence,
      recovery: z
        .object({
          paneKey: AgentStatusDismissParams.shape.paneKey,
          resolution: z.enum(['adopted', 'exited', 'rolled_back']),
          ptyId: z.string().min(1).max(512).optional()
        })
        .strict()
    })
    .strict(),
  z.object({ type: z.literal('end'), sequence }).strict(),
  z
    .object({ type: z.literal('error'), code: z.literal('agent_worker_recovery_unavailable') })
    .strict()
])
