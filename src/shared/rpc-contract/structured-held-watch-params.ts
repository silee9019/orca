import { z } from 'zod'
import { MAX_TIMER_DELAY_MS } from '../timer-delay'

export const StructuredHeldWatchRequest = z
  .object({ watchMs: z.number().int().min(1).max(MAX_TIMER_DELAY_MS) })
  .strict()
export const StructuredHeldSubscriptionParams = z
  .object({ subscriptionId: z.string().uuid() })
  .strict()
export type StructuredHeldSubscriptionParams = z.output<typeof StructuredHeldSubscriptionParams>
const sequence = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const StructuredHeldStreamFrame = z.union([
  z.object({ type: z.literal('ready'), sequence: z.literal(0) }).strict(),
  z
    .object({
      type: z.literal('event'),
      sequence,
      held: z.boolean()
    })
    .strict(),
  z.object({ type: z.literal('end'), sequence }).strict(),
  z.object({ type: z.literal('error'), code: z.literal('structured_held_unavailable') }).strict()
])
