import { randomUUID } from 'node:crypto'
import type { CommandHandler } from '../dispatch'
import { RuntimeClientError } from '../runtime/types'
import {
  TerminalSpawnWatchRequest,
  TerminalSpawnStreamFrame
} from '../../shared/rpc-contract/terminal-spawn-watch-params'
import { readAgentSessionRequest } from './agent-session-request'
import { watchRuntimeJsonEvents } from './runtime-json-event-watch'

export const TERMINAL_SPAWN_WATCH_HANDLERS: Record<string, CommandHandler> = {
  'terminal watch-spawned': async (ctx) => {
    const { watchMs, ...scope } = await readAgentSessionRequest(ctx, TerminalSpawnWatchRequest)
    await watchRuntimeJsonEvents({
      watchMs,
      subscribe: (callbacks, signal) =>
        ctx.client.subscribeTerminalSpawn(
          { ...scope, subscriptionId: randomUUID() },
          callbacks,
          signal
        ),
      parseFrame: (value) => {
        const parsed = TerminalSpawnStreamFrame.safeParse(value)
        if (!parsed.success) {
          throw new RuntimeClientError(
            'invalid_runtime_response',
            'The host returned an invalid lifecycle announcement.'
          )
        }
        const frame = parsed.data
        if (frame.type === 'error') {
          throw new RuntimeClientError(
            frame.code,
            'The lifecycle announcement source became unavailable.'
          )
        }
        if (
          (frame.type === 'ready' &&
            (JSON.stringify(frame.executionHostIds) !== JSON.stringify(scope.executionHostIds) ||
              JSON.stringify(frame.ptyIds) !== JSON.stringify(scope.ptyIds))) ||
          (frame.type === 'event' &&
            (!scope.executionHostIds.includes(frame.announcement.executionHostId) ||
              (scope.ptyIds.length > 0 && !scope.ptyIds.includes(frame.announcement.ptyId))))
        ) {
          throw new RuntimeClientError(
            'invalid_runtime_response',
            'The lifecycle announcement scope changed.'
          )
        }
        return frame
      }
    })
  }
}
