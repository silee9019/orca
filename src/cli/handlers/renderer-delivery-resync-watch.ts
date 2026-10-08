import { randomUUID } from 'node:crypto'
import type { CommandHandler } from '../dispatch'
import { RuntimeClientError } from '../runtime/types'
import {
  RendererResyncWatchRequest,
  RendererResyncStreamFrame
} from '../../shared/rpc-contract/renderer-delivery-resync-watch-params'
import { readAgentSessionRequest } from './agent-session-request'
import { watchRuntimeJsonEvents } from './runtime-json-event-watch'
export const RENDERER_DELIVERY_RESYNC_WATCH_HANDLERS: Record<string, CommandHandler> = {
  'terminal watch-delivery-resync': async (ctx) => {
    const { watchMs, ...scope } = await readAgentSessionRequest(ctx, RendererResyncWatchRequest)
    await watchRuntimeJsonEvents({
      watchMs,
      subscribe: (callbacks, signal) =>
        ctx.client.subscribeRendererDeliveryResync(
          { ...scope, subscriptionId: randomUUID() },
          callbacks,
          signal
        ),
      parseFrame: (value) => {
        const parsed = RendererResyncStreamFrame.safeParse(value)
        if (!parsed.success) {
          throw new RuntimeClientError(
            'invalid_runtime_response',
            'The host returned an invalid renderer resync request.'
          )
        }
        const frame = parsed.data
        if (frame.type === 'error') {
          throw new RuntimeClientError(
            frame.code,
            'The selected renderer request owner changed or became unavailable.'
          )
        }
        if (
          (frame.type === 'ready' &&
            Object.entries(scope).some(
              ([key, expected]) => Reflect.get(frame, key) !== expected
            )) ||
          (frame.type === 'event' && frame.request.rendererId !== scope.expectedRendererId)
        ) {
          throw new RuntimeClientError(
            'invalid_runtime_response',
            'The renderer resync scope changed.'
          )
        }
        return frame
      }
    })
  }
}
