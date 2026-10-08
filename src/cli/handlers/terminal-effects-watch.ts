import { randomUUID } from 'node:crypto'
import type { CommandHandler } from '../dispatch'
import { RuntimeClientError } from '../runtime/types'
import {
  TerminalEffectsWatchRequest,
  TerminalEffectsStreamFrame
} from '../../shared/rpc-contract/terminal-effects-watch-params'
import { readAgentSessionRequest } from './agent-session-request'
import { watchRuntimeJsonEvents } from './runtime-json-event-watch'

export const TERMINAL_EFFECTS_WATCH_HANDLERS: Record<string, CommandHandler> = {
  'terminal watch-effects': async (ctx) => {
    const { watchMs, ...target } = await readAgentSessionRequest(ctx, TerminalEffectsWatchRequest)
    await watchRuntimeJsonEvents({
      watchMs,
      subscribe: (callbacks, signal) =>
        ctx.client.subscribeTerminalEffects(
          { ...target, subscriptionId: randomUUID() },
          callbacks,
          signal
        ),
      parseFrame: (value) => {
        const parsed = TerminalEffectsStreamFrame.safeParse(value)
        if (!parsed.success) {
          throw new RuntimeClientError(
            'invalid_runtime_response',
            'The host returned an invalid terminal fact.'
          )
        }
        const frame = parsed.data
        if (frame.type === 'error') {
          throw new RuntimeClientError(frame.code, 'The terminal fact owner changed.')
        }
        if (
          (frame.type === 'ready' &&
            Object.entries(target).some(
              ([key, expected]) => Reflect.get(frame, key) !== expected
            )) ||
          (frame.type === 'event' && frame.batch.ptyId !== target.expectedPtyId)
        ) {
          throw new RuntimeClientError(
            'invalid_runtime_response',
            'The terminal fact scope changed.'
          )
        }
        return frame
      }
    })
  }
}
