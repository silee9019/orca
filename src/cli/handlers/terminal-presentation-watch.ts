import { randomUUID } from 'node:crypto'
import { TerminalPresentationStreamFrame } from '../../shared/rpc-contract/terminal-presentation-stream-frame'
import { TerminalPresentationWatchRequest } from '../../shared/rpc-contract/terminal-presentation-watch-params'
import type { CommandHandler } from '../dispatch'
import { RuntimeClientError } from '../runtime/types'
import { readAgentSessionRequest } from './agent-session-request'
import { watchRuntimeJsonEvents } from './runtime-json-event-watch'

export const TERMINAL_PRESENTATION_WATCH_HANDLERS: Record<string, CommandHandler> = {
  'terminal watch-driver': (ctx) => watch(ctx, 'driver'),
  'terminal watch-fit': (ctx) => watch(ctx, 'fit')
}
async function watch(ctx: Parameters<CommandHandler>[0], kind: 'driver' | 'fit') {
  const { watchMs, ...session } = await readAgentSessionRequest(
    ctx,
    TerminalPresentationWatchRequest
  )
  await watchRuntimeJsonEvents({
    watchMs,
    subscribe: (callbacks, signal) =>
      ctx.client.subscribeTerminalPresentation(
        { ...session, kind, subscriptionId: randomUUID() },
        callbacks,
        signal
      ),
    parseFrame: (value) => {
      const frame = TerminalPresentationStreamFrame.safeParse(value)
      if (
        !frame.success ||
        ((frame.data.type === 'ready' || frame.data.type === 'event') && frame.data.kind !== kind)
      ) {
        throw new RuntimeClientError(
          'invalid_runtime_response',
          'The host returned an invalid presentation event or stream identity.'
        )
      }
      return frame.data
    }
  })
}
