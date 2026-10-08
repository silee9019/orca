import { defineStreamingMethod } from '../core'
import {
  RendererResyncSubscriptionParams,
  RendererDeliveryResyncSignal
} from '../../../../shared/rpc-contract/renderer-delivery-resync-watch-params'
import { createRuntimeJsonEventSubscription } from '../../runtime-json-event-subscription'
import { subscribePtyControlRequests } from '../../pty-control-request-observers'
export const RENDERER_DELIVERY_RESYNC_WATCH_METHODS = [
  defineStreamingMethod({
    name: 'renderer.deliveryResync.subscribe',
    params: RendererResyncSubscriptionParams,
    handler: async (params, context, emit) => {
      const { runtime, signal } = context
      const assertOwner = () => {
        if (signal?.aborted || runtime.getRuntimeId() !== params.expectedRuntimeId) {
          throw new Error('renderer_resync_owner_changed_or_cancelled')
        }
      }
      assertOwner()
      const stream = createRuntimeJsonEventSubscription(
        context,
        'terminalControl',
        params.subscriptionId,
        emit,
        assertOwner
      )
      const fail = () => {
        emit({ type: 'error', code: 'terminal_control_owner_changed_or_cancelled' })
        stream.close()
      }
      try {
        stream.register(
          subscribePtyControlRequests(
            runtime,
            (request) => {
              if (
                request.kind !== 'delivery-resync' ||
                request.rendererId !== params.expectedRendererId
              ) {
                return
              }
              const parsed = RendererDeliveryResyncSignal.safeParse(request)
              if (!parsed.success) {
                fail()
                return
              }
              stream.event({ request: parsed.data, rendererApplied: false })
            },
            fail
          )
        )
        const { subscriptionId: _subscriptionId, ...scope } = params
        stream.ready(scope)
      } catch (error) {
        stream.close()
        throw error
      }
    }
  })
]
