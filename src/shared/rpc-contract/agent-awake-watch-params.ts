import { z } from 'zod'
import { MAX_TIMER_DELAY_MS } from '../timer-delay'
import { COMPUTER_AWAKE_MODES } from '../computer-awake-mode'

export const AgentAwakeWatchRequest = z
  .object({ watchMs: z.number().int().min(1).max(MAX_TIMER_DELAY_MS) })
  .strict()
export const AgentAwakeSubscriptionParams = z.object({ subscriptionId: z.string().uuid() }).strict()
export type AgentAwakeSubscriptionParams = z.output<typeof AgentAwakeSubscriptionParams>
const sequence = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const AgentAwakeStreamFrame = z.union([
  z.object({ type: z.literal('ready'), sequence: z.literal(0) }).strict(),
  z
    .object({
      type: z.literal('event'),
      sequence,
      status: z.object({ mode: z.enum(COMPUTER_AWAKE_MODES), active: z.boolean() }).strict()
    })
    .strict(),
  z.object({ type: z.literal('end'), sequence }).strict(),
  z.object({ type: z.literal('error'), code: z.literal('agent_awake_unavailable') }).strict()
])
