import { defineStreamingMethod } from '../core'
import { StructuredHeldSubscriptionParams } from '../../../../shared/rpc-contract/structured-held-watch-params'
import { createRuntimeJsonEventSubscription } from '../../runtime-json-event-subscription'
import { onStructuredAgentSessionsHeldChanged } from '../../../native-chat/agent-session-wire/structured-agent-session-registry'

export const STRUCTURED_HELD_WATCH_METHODS = [
  defineStreamingMethod({
    name: 'structuredHeld.subscribe',
    params: StructuredHeldSubscriptionParams,
    handler: async (params, context, emit) => {
      const stream = createRuntimeJsonEventSubscription(
        context,
        'structuredHeld',
        params.subscriptionId,
        emit,
        () => {}
      )
      try {
        stream.register(onStructuredAgentSessionsHeldChanged((held) => stream.event({ held })))
        stream.ready()
      } catch (error) {
        stream.close()
        throw error
      }
    }
  })
]
