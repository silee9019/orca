import { randomUUID } from 'node:crypto'
import type { CommandHandler } from '../dispatch'
import { RuntimeClientError } from '../runtime/types'
import {
  TerminalExitWatchRequest,
  TerminalExitStreamFrame
} from '../../shared/rpc-contract/terminal-exit-watch-params'
import { readAgentSessionRequest } from './agent-session-request'
import { watchRuntimeJsonEvents } from './runtime-json-event-watch'

export const TERMINAL_EXIT_WATCH_HANDLERS: Record<string, CommandHandler> = {
  'terminal watch-exit': async (ctx) => {
    const { watchMs, ...target } = await readAgentSessionRequest(ctx, TerminalExitWatchRequest)
    await watchRuntimeJsonEvents({
      watchMs,
      subscribe: (callbacks, signal) =>
        ctx.client.subscribeTerminalExit(
          { ...target, subscriptionId: randomUUID() },
          callbacks,
          signal
        ),
      parseFrame: (value) => {
        const parsed = TerminalExitStreamFrame.safeParse(value)
        if (!parsed.success) {
          throw new RuntimeClientError(
            'invalid_runtime_response',
            'The host returned an invalid terminal exit observation.'
          )
        }
        const frame = parsed.data
        if (frame.type === 'error') {
          throw new RuntimeClientError(frame.code, 'The terminal exit observation owner changed.')
        }
        if (
          (frame.type === 'ready' &&
            Object.entries(target).some(
              ([key, expected]) => Reflect.get(frame, key) !== expected
            )) ||
          (frame.type === 'event' &&
            (frame.observation.ptyId !== target.expectedPtyId ||
              frame.observation.incarnationId !== target.expectedIncarnationId ||
              frame.observation.executionHostId !== target.expectedExecutionHostId ||
              (frame.observation.verdict.status === 'live' &&
                frame.observation.verdict.ptyIds.some((id) => id !== target.expectedPtyId))))
        ) {
          throw new RuntimeClientError(
            'invalid_runtime_response',
            'The terminal exit observation scope changed.'
          )
        }
        return frame
      }
    })
  }
}
