import { REMOTE_RUNTIME_MAX_OUTBOUND_JSON_BYTES } from '../../shared/remote-runtime-memory-limits'
import type {
  NativeChatSubscription,
  NativeChatSubscriptionCallbacks
} from '../runtime/native-chat-subscription'
import { RuntimeClientError, RuntimeRpcFailureError } from '../runtime/types'

type RuntimeJsonEventFrame =
  | { type: 'ready'; sequence: 0 }
  | { type: 'event' | 'end'; sequence: number }
  | { type: 'error' }

export async function watchRuntimeJsonEvents(options: {
  watchMs: number
  subscribe: (
    callbacks: NativeChatSubscriptionCallbacks,
    signal: AbortSignal
  ) => Promise<NativeChatSubscription>
  parseFrame: (value: unknown) => RuntimeJsonEventFrame
}): Promise<void> {
  const { watchMs } = options
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
    subscription = await options.subscribe(
      {
        onResponse: (response) => {
          if (finished) {
            return
          }
          if (!response.ok) {
            finish({ error: new RuntimeRpcFailureError(response) })
            return
          }
          let frame: RuntimeJsonEventFrame
          try {
            frame = options.parseFrame(response.result)
          } catch (error) {
            finish({
              error:
                error instanceof Error
                  ? error
                  : new RuntimeClientError(
                      'invalid_runtime_response',
                      'Invalid runtime event frame.'
                    )
            })
            return
          }
          if (frame.type === 'error') {
            finish({
              error: new RuntimeClientError(
                'runtime_event_unavailable',
                'The selected host could not read its event.'
              )
            })
            return
          }
          const event = frame
          if (
            (event.type === 'ready' && ready) ||
            (event.type === 'event' && (!ready || event.sequence !== sequence + 1)) ||
            (event.type === 'end' && (!ready || event.sequence !== sequence))
          ) {
            finish({
              error: new RuntimeClientError(
                'invalid_runtime_response',
                'The runtime event stream sequence changed.'
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
                'Runtime event output exceeded its memory budget.'
              )
            })
            controller.abort()
            return
          }
          console.log(output)
          if (frame.type === 'end') {
            finish({ reason: 'host-end' })
          }
        },
        onError: (error) => finish({ error }),
        onClose: () =>
          finish({
            error: new RuntimeClientError(
              'runtime_unavailable',
              'The event connection closed without a host end frame.'
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
