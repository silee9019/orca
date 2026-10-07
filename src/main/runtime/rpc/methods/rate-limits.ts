import { defineMethod, defineStreamingMethod } from '../core'
import {
  RateLimitTargetParams,
  RateLimitPollingParams
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
    handler: async (_, { runtime, connectionId, signal }, emit) => {
      if (signal?.aborted) {
        return
      }
      await new Promise<void>((resolve, reject) => {
        const controller = runtime.getRateLimitController()
        const subscriptionId = `rate-limits-${connectionId ?? 'inproc'}-${++subscriptionSequence}`
        let closed = false
        let failure: { error: unknown } | null = null
        const close = () => runtime.cleanupSubscription(subscriptionId)
        const unsubscribe = controller.onUpdate((state) => {
          if (closed) {
            return
          }
          try {
            emit({ type: 'snapshot', state })
          } catch (error) {
            failure = { error }
            close()
          }
        })
        runtime.registerSubscriptionCleanup(
          subscriptionId,
          () => {
            if (closed) {
              return
            }
            closed = true
            signal?.removeEventListener('abort', close)
            try {
              unsubscribe()
            } catch (error) {
              failure ??= { error }
            }
            try {
              emit({ type: 'end' })
            } catch (error) {
              failure ??= { error }
            }
            if (failure) {
              reject(failure.error)
            } else {
              resolve()
            }
          },
          connectionId
        )
        signal?.addEventListener('abort', close, { once: true })
        if (signal?.aborted) {
          close()
          return
        }
        try {
          emit({ type: 'ready', subscriptionId, state: controller.get() })
        } catch (error) {
          failure = { error }
          close()
        }
      })
    }
  })
]
