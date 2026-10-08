import { randomUUID } from 'node:crypto'
import type { CommandHandler } from '../dispatch'
import { RuntimeClientError } from '../runtime/types'
import {
  TerminalControlWatchRequest,
  TerminalControlStreamFrame
} from '../../shared/rpc-contract/terminal-control-watch-params'
import { readAgentSessionRequest } from './agent-session-request'
import { watchRuntimeJsonEvents } from './runtime-json-event-watch'

async function watchRequests(ctx: Parameters<CommandHandler>[0], modelRestoreOnly: boolean) {
  const { watchMs, ...scope } = await readAgentSessionRequest(ctx, TerminalControlWatchRequest)
  await watchRuntimeJsonEvents({
    watchMs,
    subscribe: (callbacks, signal) =>
      (modelRestoreOnly
        ? ctx.client.subscribeTerminalModelRestore.bind(ctx.client)
        : ctx.client.subscribeTerminalControlRequests.bind(ctx.client))(
        { ...scope, subscriptionId: randomUUID() },
        callbacks,
        signal
      ),
    parseFrame: (value) => {
      const parsed = TerminalControlStreamFrame.safeParse(value)
      if (!parsed.success) {
        throw new RuntimeClientError(
          'invalid_runtime_response',
          'The host returned an invalid renderer request.'
        )
      }
      const frame = parsed.data
      if (frame.type === 'error') {
        throw new RuntimeClientError(
          frame.code,
          'The renderer request owner changed or became unavailable.'
        )
      }
      if (
        (frame.type === 'ready' &&
          Object.entries(scope).some(([key, expected]) => Reflect.get(frame, key) !== expected)) ||
        (frame.type === 'event' &&
          ((frame.request.kind === 'model-restore-needed') !== modelRestoreOnly ||
            frame.request.ptyId !== scope.expectedPtyId ||
            frame.request.rendererId !== scope.expectedRendererId))
      ) {
        throw new RuntimeClientError(
          'invalid_runtime_response',
          'The renderer request scope changed.'
        )
      }
      return frame
    }
  })
}
export const TERMINAL_CONTROL_WATCH_HANDLERS: Record<string, CommandHandler> = {
  'terminal watch-control-requests': (ctx) => watchRequests(ctx, false),
  'terminal watch-model-restore': (ctx) => watchRequests(ctx, true)
}
