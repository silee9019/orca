import { defineStreamingMethod } from '../core'
import { AgentAwakeSubscriptionParams } from '../../../../shared/rpc-contract/agent-awake-watch-params'
import { createRuntimeJsonEventSubscription } from '../../runtime-json-event-subscription'

export const AGENT_AWAKE_WATCH_METHODS = [
  defineStreamingMethod({
    name: 'agentAwake.subscribe',
    params: AgentAwakeSubscriptionParams,
    handler: async (params, context, emit) => {
      const { runtime } = context
      const assertOwner = () => {
        if (!runtime.getAgentAwakeStatus()) {
          throw Object.assign(new Error('The selected host has no awake service.'), {
            code: 'agent_awake_unavailable'
          })
        }
      }
      if (!runtime.getAgentAwakeStatus()) {
        emit({ type: 'error', code: 'agent_awake_unavailable' })
        return
      }
      const stream = createRuntimeJsonEventSubscription(
        context,
        'agentAwake',
        params.subscriptionId,
        emit,
        assertOwner
      )
      try {
        const dispose = runtime.subscribeAgentAwakeChanges((status) => stream.event({ status }))
        if (!dispose) {
          emit({ type: 'error', code: 'agent_awake_unavailable' })
          stream.close()
          return
        }
        stream.register(dispose)
        stream.ready()
      } catch (error) {
        stream.close()
        throw error
      }
    }
  })
]
