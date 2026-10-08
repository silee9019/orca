import { randomUUID } from 'node:crypto'
import type { CommandHandler } from '../dispatch'
import { RuntimeClientError } from '../runtime/types'
import {
  TerminalRendererDataWatchRequest,
  TerminalRendererDataStreamFrame
} from '../../shared/rpc-contract/terminal-renderer-data-watch-params'
import { readAgentSessionRequest } from './agent-session-request'
import { watchRuntimeJsonEvents } from './runtime-json-event-watch'
export const TERMINAL_RENDERER_DATA_WATCH_HANDLERS: Record<string, CommandHandler> = {
  'terminal watch-renderer-data': async (ctx) => {
    const { watchMs, ...scope } = await readAgentSessionRequest(
      ctx,
      TerminalRendererDataWatchRequest
    )
    await watchRuntimeJsonEvents({
      watchMs,
      subscribe: (callbacks, signal) =>
        ctx.client.subscribeTerminalRendererData(
          { ...scope, subscriptionId: randomUUID() },
          callbacks,
          signal
        ),
      parseFrame: (value) => {
        const parsed = TerminalRendererDataStreamFrame.safeParse(value)
        if (!parsed.success) {
          throw new RuntimeClientError(
            'invalid_runtime_response',
            'The host returned an invalid renderer data payload.'
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
          (frame.type === 'event' &&
            (frame.request.rendererId !== scope.expectedRendererId ||
              frame.request.ptyId !== scope.expectedPtyId))
        ) {
          throw new RuntimeClientError(
            'invalid_runtime_response',
            'The renderer data scope changed.'
          )
        }
        return frame
      }
    })
  }
}
