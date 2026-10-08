import { randomUUID } from 'node:crypto'
import type { CommandHandler } from '../dispatch'
import { RuntimeClientError } from '../runtime/types'
import {
  AgentAwakeWatchRequest,
  AgentAwakeStreamFrame
} from '../../shared/rpc-contract/agent-awake-watch-params'
import { readAgentSessionRequest } from './agent-session-request'
import { watchRuntimeJsonEvents } from './runtime-json-event-watch'

export const AGENT_AWAKE_WATCH_HANDLERS: Record<string, CommandHandler> = {
  'agent awake watch': async (ctx) => {
    const { watchMs } = await readAgentSessionRequest(ctx, AgentAwakeWatchRequest)
    await watchRuntimeJsonEvents({
      watchMs,
      subscribe: (callbacks, signal) =>
        ctx.client.subscribeAgentAwake({ subscriptionId: randomUUID() }, callbacks, signal),
      parseFrame: (value) => {
        const frame = AgentAwakeStreamFrame.safeParse(value)
        if (!frame.success) {
          throw new RuntimeClientError(
            'invalid_runtime_response',
            'The selected host returned an invalid awake event.'
          )
        }
        if (frame.data.type === 'error') {
          throw new RuntimeClientError(
            'agent_awake_unavailable',
            'The selected host has no available awake subscription.'
          )
        }
        return frame.data
      }
    })
  }
}
