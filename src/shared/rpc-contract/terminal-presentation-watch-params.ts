import { z } from 'zod'
import { MAX_TIMER_DELAY_MS } from '../timer-delay'
import { TerminalPresentationWaitParams } from './terminal-presentation-wait-params'

export const TerminalPresentationWatchRequest = TerminalPresentationWaitParams.omit({
  timeoutMs: true
})
  .extend({ watchMs: z.number().int().min(1).max(MAX_TIMER_DELAY_MS) })
  .strict()
export const TerminalPresentationSubscriptionParams = TerminalPresentationWatchRequest.omit({
  watchMs: true
})
  .extend({ kind: z.enum(['driver', 'fit']), subscriptionId: z.string().uuid() })
  .strict()
export type TerminalPresentationSubscriptionParams = z.output<
  typeof TerminalPresentationSubscriptionParams
>
