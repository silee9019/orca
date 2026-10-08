import { z } from 'zod'
import { NativeChatSession } from './native-chat-params'
import { MAX_TIMER_DELAY_MS } from '../timer-delay'

export const NativeChatWatchRequest = NativeChatSession.omit({
  subscriptionId: true,
  beforeOffset: true,
  capabilities: true
})
  .extend({ watchMs: z.number().int().min(1).max(MAX_TIMER_DELAY_MS) })
  .strict()
export type NativeChatSubscriptionParams = z.output<typeof NativeChatSession>
