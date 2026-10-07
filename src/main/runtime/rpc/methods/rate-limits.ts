import { defineMethod, defineStreamingMethod } from '../core'
import {
  RateLimitTargetParams,
  RateLimitPollingParams,
  RateLimitSubscriptionParams
} from '../../../../shared/rpc-contract/usage-params'

let subscriptionSequence = 0

export const RATE_LIMIT_METHODS = [
  defineMethod({
    name: 'rateLimits.get',
    params: null,
    handler: (_, { runtime }) => runtime.getRateLimitController().get()
  }),
  defineMethod({
    name: 'rateLimits.refresh',
    params: null,
    handler: (_, { runtime }) => runtime.getRateLimitController().refresh()
  }),
  defineMethod({
    name: 'rateLimits.refreshClaudeForTarget',
    params: RateLimitTargetParams,
    handler: ({ target }, { runtime }) =>
      runtime.getRateLimitController().refreshClaudeForTarget(target)
  }),
  defineMethod({
    name: 'rateLimits.refreshCodexForTarget',
    params: RateLimitTargetParams,
    handler: ({ target }, { runtime }) =>
      runtime.getRateLimitController().refreshCodexForTarget(target)
  }),
  defineMethod({
    name: 'rateLimits.setPollingInterval',
    params: RateLimitPollingParams,
    handler: ({ ms }, { runtime }) => {
      runtime.getRateLimitController().setPollingInterval(ms)
      return { ms }
    }
  }),
  defineMethod({
    name: 'rateLimits.fetchInactiveClaudeAccounts',
    params: null,
    handler: async (_, { runtime }) => {
      await runtime.getRateLimitController().fetchInactiveClaudeAccounts()
      return { refreshed: true }
    }
  }),
  defineMethod({
    name: 'rateLimits.fetchInactiveCodexAccounts',
    params: null,
    handler: async (_, { runtime }) => {
      await runtime.getRateLimitController().fetchInactiveCodexAccounts()
      return { refreshed: true }
    }
  }),
  defineMethod({
    name: 'rateLimits.refreshMiniMax',
    params: null,
    handler: (_, { runtime }) => runtime.getRateLimitController().refreshMiniMax()
  }),
  defineMethod({
    name: 'rateLimits.refreshGrok',
    params: null,
    handler: (_, { runtime }) => runtime.getRateLimitController().refreshGrok()
  }),
  defineStreamingMethod({
    name: 'rateLimits.subscribe',
    params: null,
    handler: async (_, { runtime, connectionId }, emit) => {
      await new Promise<void>((resolve) => {
        const controller = runtime.getRateLimitController()
        const unsubscribe = controller.onUpdate((state) => emit({ type: 'snapshot', state }))
        const subscriptionId = `rate-limits-${connectionId ?? 'inproc'}-${++subscriptionSequence}`
        runtime.registerSubscriptionCleanup(
          subscriptionId,
          () => {
            unsubscribe()
            emit({ type: 'end' })
            resolve()
          },
          connectionId
        )
        emit({ type: 'ready', subscriptionId, state: controller.get() })
      })
    }
  }),
  defineMethod({
    name: 'rateLimits.unsubscribe',
    params: RateLimitSubscriptionParams,
    handler: ({ subscriptionId }, { runtime }) => {
      runtime.cleanupSubscription(subscriptionId)
      return { unsubscribed: true }
    }
  })
]
