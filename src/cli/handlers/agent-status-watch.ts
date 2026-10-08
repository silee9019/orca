import { randomUUID } from 'node:crypto'
import type { CommandHandler } from '../dispatch'
import { RuntimeClientError } from '../runtime/types'
import {
  AgentStatusWatchRequest,
  AgentStatusStreamFrame
} from '../../shared/rpc-contract/agent-status-watch-params'
import { readAgentSessionRequest } from './agent-session-request'
import { watchRuntimeJsonEvents } from './runtime-json-event-watch'

export const AGENT_STATUS_WATCH_HANDLERS: Record<string, CommandHandler> = {
  'agent status watch': async (ctx) => {
    const { watchMs, ...scope } = await readAgentSessionRequest(ctx, AgentStatusWatchRequest)
    await watchRuntimeJsonEvents({
      watchMs,
      subscribe: (callbacks, signal) =>
        ctx.client.subscribeAgentStatus(
          { ...scope, subscriptionId: randomUUID() },
          callbacks,
          signal
        ),
      parseFrame: (value) => {
        const parsed = AgentStatusStreamFrame.safeParse(value)
        if (!parsed.success) {
          throw new RuntimeClientError(
            'invalid_runtime_response',
            'The selected host returned an invalid status event.'
          )
        }
        const frame = parsed.data
        if (frame.type === 'error') {
          throw new RuntimeClientError(
            frame.code,
            'The selected host cannot publish status events.'
          )
        }
        const invalidScope =
          frame.type === 'ready'
            ? JSON.stringify(frame.paneKeys) !== JSON.stringify(scope.paneKeys) ||
              JSON.stringify(frame.connectionIds) !== JSON.stringify(scope.connectionIds)
            : frame.type === 'event'
              ? frame.kind === 'set'
                ? !scope.paneKeys.includes(frame.status.paneKey)
                : 'paneKey' in frame.clear
                  ? !scope.paneKeys.includes(frame.clear.paneKey)
                  : !scope.connectionIds.includes(frame.clear.connectionId)
              : false
        if (invalidScope) {
          throw new RuntimeClientError(
            'invalid_runtime_response',
            'The status event scope changed.'
          )
        }
        return frame
      }
    })
  }
}
