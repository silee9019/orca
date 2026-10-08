import { randomUUID } from 'node:crypto'
import type { CommandHandler } from '../dispatch'
import { RuntimeClientError } from '../runtime/types'
import {
  RemoteWorkspaceWatchRequest,
  RemoteWorkspaceStreamFrame
} from '../../shared/rpc-contract/remote-workspace-watch-params'
import { readAgentSessionRequest } from './agent-session-request'
import { watchRuntimeJsonEvents } from './runtime-json-event-watch'

export const REMOTE_WORKSPACE_WATCH_HANDLERS: Record<string, CommandHandler> = {
  'agent remote-workspace watch': async (ctx) => {
    const { watchMs, targetIds } = await readAgentSessionRequest(ctx, RemoteWorkspaceWatchRequest)
    await watchRuntimeJsonEvents({
      watchMs,
      subscribe: (callbacks, signal) =>
        ctx.client.subscribeRemoteWorkspace(
          { targetIds, subscriptionId: randomUUID() },
          callbacks,
          signal
        ),
      parseFrame: (value) => {
        const frame = RemoteWorkspaceStreamFrame.safeParse(value)
        if (
          !frame.success ||
          (frame.data.type === 'event' && !targetIds.includes(frame.data.change.targetId)) ||
          (frame.data.type === 'ready' &&
            JSON.stringify(frame.data.targetIds) !== JSON.stringify(targetIds))
        ) {
          throw new RuntimeClientError(
            'invalid_runtime_response',
            'The selected host returned an invalid workspace event or target scope.'
          )
        }
        if (frame.data.type === 'error') {
          throw new RuntimeClientError(
            'remote_workspace_unavailable',
            'The selected host cannot observe those workspace targets.'
          )
        }
        return frame.data
      }
    })
  }
}
