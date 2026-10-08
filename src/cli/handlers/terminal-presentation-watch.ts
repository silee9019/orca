import { REMOTE_RUNTIME_MAX_OUTBOUND_JSON_BYTES } from '../../shared/remote-runtime-memory-limits'
import { randomUUID } from 'node:crypto'
import { TerminalPresentationStreamFrame } from '../../shared/rpc-contract/terminal-presentation-stream-frame'
import type { CommandHandler } from '../dispatch'
import type { NativeChatSubscription } from '../runtime/native-chat-subscription'
import { RuntimeClientError, RuntimeRpcFailureError } from '../runtime/types'
import { TerminalPresentationWatchRequest } from '../../shared/rpc-contract/terminal-presentation-watch-params'
import { readAgentSessionRequest } from './agent-session-request'

export const TERMINAL_PRESENTATION_WATCH_HANDLERS: Record<string, CommandHandler> = {
  'terminal watch-driver': (ctx) => watch(ctx, 'driver'),
  'terminal watch-fit': (ctx) => watch(ctx, 'fit')
}
async function watch(ctx: Parameters<CommandHandler>[0], kind: 'driver' | 'fit') {
  const { watchMs, ...session } = await readAgentSessionRequest(
    ctx,
    TerminalPresentationWatchRequest
  )
  const controller = new AbortController()
  let subscription: NativeChatSubscription | undefined
  let timer: NodeJS.Timeout | undefined
  let receivedFrames = 0
  let finished = false
  let ready = false
  let sequence = 0
  let interrupted = 0
  type Outcome =
    | { reason: 'timeout' | 'interrupted' | 'host-end'; error?: never }
    | { error: Error; reason?: never }
  let finish: (outcome: Outcome) => void = () => {}
  const completed = new Promise<Outcome>((resolve) => {
    finish = (outcome) => {
      if (!finished) {
        finished = true
        resolve(outcome)
      }
    }
  })
  const interrupt = (): void => {
    interrupted = 130
    finish({ reason: 'interrupted' })
    controller.abort()
  }
  const terminate = (): void => {
    interrupted = 143
    finish({ reason: 'interrupted' })
    controller.abort()
  }
  process.on('SIGINT', interrupt)
  process.on('SIGTERM', terminate)
  try {
    subscription = await ctx.client.subscribeTerminalPresentation(
      { ...session, kind, subscriptionId: randomUUID() },
      {
        onResponse: (response) => {
          if (finished) {
            return
          }
          if (!response.ok) {
            finish({ error: new RuntimeRpcFailureError(response) })
            return
          }
          const frame = TerminalPresentationStreamFrame.safeParse(response.result)
          if (!frame.success) {
            finish({
              error: new RuntimeClientError(
                'invalid_runtime_response',
                'The host returned an invalid presentation event.'
              )
            })
            return
          }
          if (frame.data.type === 'error') {
            finish({
              error: new RuntimeClientError(
                'terminal_event_unavailable',
                'The selected host could not read its presentation event.'
              )
            })
            return
          }
          const event = frame.data
          if (
            (event.type === 'ready' && (ready || event.kind !== kind)) ||
            (event.type === 'event' &&
              (!ready || event.kind !== kind || event.sequence !== sequence + 1)) ||
            (event.type === 'end' && (!ready || event.sequence !== sequence))
          ) {
            finish({
              error: new RuntimeClientError(
                'invalid_runtime_response',
                'The terminal event stream identity or sequence changed.'
              )
            })
            return
          }
          if (event.type === 'ready') {
            ready = true
          }
          if (event.type === 'event') {
            sequence = event.sequence
          }
          receivedFrames += 1
          const output = JSON.stringify(response.result)
          if (
            Buffer.byteLength(output, 'utf8') + 1 + process.stdout.writableLength >
            REMOTE_RUNTIME_MAX_OUTBOUND_JSON_BYTES
          ) {
            finish({
              error: new RuntimeClientError(
                'slow_consumer',
                'Terminal event output exceeded its memory budget.'
              )
            })
            controller.abort()
            return
          }
          console.log(output)
          if (frame.data.type === 'end') {
            finish({ reason: 'host-end' })
          }
        },
        onError: (error) => finish({ error }),
        onClose: () =>
          finish({
            error: new RuntimeClientError(
              'runtime_unavailable',
              'The presentation event connection closed without a host end frame.'
            )
          })
      },
      controller.signal
    )
    timer = setTimeout(() => finish({ reason: 'timeout' }), watchMs)
    const outcome = await completed
    if (outcome.error) {
      throw outcome.error
    }
    process.exitCode = interrupted
    console.log(
      JSON.stringify({
        type: 'watch-ended',
        reason: outcome.reason,
        receivedFrames,
        eventsComplete: false
      })
    )
  } catch (error) {
    if (!interrupted) {
      throw error
    }
    process.exitCode = interrupted
    console.log(
      JSON.stringify({
        type: 'watch-ended',
        reason: 'interrupted',
        receivedFrames,
        eventsComplete: false
      })
    )
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
    process.removeListener('SIGINT', interrupt)
    process.removeListener('SIGTERM', terminate)
    subscription?.close()
    controller.abort()
  }
}
