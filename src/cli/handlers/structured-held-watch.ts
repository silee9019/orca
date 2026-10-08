import { randomUUID } from 'node:crypto'
import type { CommandHandler } from '../dispatch'
import { RuntimeClientError } from '../runtime/types'
import {
  StructuredHeldWatchRequest,
  StructuredHeldStreamFrame
} from '../../shared/rpc-contract/structured-held-watch-params'
import { readAgentSessionRequest } from './agent-session-request'
import { watchRuntimeJsonEvents } from './runtime-json-event-watch'

export const STRUCTURED_HELD_WATCH_HANDLERS: Record<string, CommandHandler> = {
  'agent session watch-held': async (ctx) => {
    const { watchMs } = await readAgentSessionRequest(ctx, StructuredHeldWatchRequest)
    await watchRuntimeJsonEvents({
      watchMs,
      subscribe: (callbacks, signal) =>
        ctx.client.subscribeStructuredHeld({ subscriptionId: randomUUID() }, callbacks, signal),
      parseFrame: (value) => {
        const frame = StructuredHeldStreamFrame.safeParse(value)
        if (!frame.success) {
          throw new RuntimeClientError(
            'invalid_runtime_response',
            'The selected host returned an invalid structured-session held event.'
          )
        }
        if (frame.data.type === 'error') {
          throw new RuntimeClientError(
            'structured_held_unavailable',
            'The selected host has no available structured-session held subscription.'
          )
        }
        return frame.data
      }
    })
  }
}
