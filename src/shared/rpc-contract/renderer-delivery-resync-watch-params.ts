import { z } from 'zod'
import { MAX_TIMER_DELAY_MS } from '../timer-delay'
const rendererId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const Target = z
  .object({
    expectedRuntimeId: z.string().min(1).max(1024),
    executionHostId: z.literal('local'),
    expectedRendererId: rendererId
  })
  .strict()
export const RendererResyncWatchRequest = Target.extend({
  watchMs: z.number().int().min(1).max(MAX_TIMER_DELAY_MS)
}).strict()
export const RendererResyncSubscriptionParams = Target.extend({
  subscriptionId: z.string().uuid()
}).strict()
export type RendererResyncSubscriptionParams = z.output<typeof RendererResyncSubscriptionParams>
export const RendererDeliveryResyncSignal = z
  .object({
    kind: z.literal('delivery-resync'),
    rendererId,
    requestId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
  })
  .strict()
export type RendererDeliveryResyncSignal = z.output<typeof RendererDeliveryResyncSignal>
const sequence = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const RendererResyncStreamFrame = z.union([
  Target.extend({ type: z.literal('ready'), sequence: z.literal(0) }).strict(),
  z
    .object({
      type: z.literal('event'),
      sequence,
      request: RendererDeliveryResyncSignal,
      rendererApplied: z.literal(false)
    })
    .strict(),
  z.object({ type: z.literal('end'), sequence }).strict(),
  z
    .object({
      type: z.literal('error'),
      code: z.literal('terminal_control_owner_changed_or_cancelled')
    })
    .strict()
])
