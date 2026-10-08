import { createConnection } from 'node:net'
import { randomUUID } from 'node:crypto'
import { findTransport, type RuntimeMetadata } from '../../shared/runtime-bootstrap'
import { REMOTE_RUNTIME_MAX_OUTBOUND_JSON_BYTES } from '../../shared/remote-runtime-memory-limits'
import { isSafeTimerDelayMs } from '../../shared/timer-delay'
import type { NativeChatSubscriptionParams } from '../../shared/rpc-contract/native-chat-watch'
import type {
  NativeChatSubscription,
  NativeChatSubscriptionCallbacks
} from './native-chat-subscription'
import { isKeepaliveFrame, RuntimeRpcEnvelopeSchema } from './envelope-schema'
import { RuntimeClientError, RuntimeRpcFailureError } from './types'
import { runtimeAccessDeniedError } from './runtime-access-denied'

export function subscribeLocalNativeChat(
  metadata: RuntimeMetadata,
  params: NativeChatSubscriptionParams,
  timeoutMs: number,
  callbacks: NativeChatSubscriptionCallbacks,
  signal: AbortSignal
): Promise<NativeChatSubscription> {
  if (metadata.nativeChatStreaming !== 1) {
    return Promise.reject(
      new RuntimeClientError(
        'method_not_supported',
        'The selected local host does not advertise native transcript streaming. Update that host.'
      )
    )
  }
  const transport = findTransport(metadata, 'unix', 'named-pipe')
  if (!transport || !metadata.authToken) {
    return Promise.reject(
      new RuntimeClientError(
        'runtime_unavailable',
        'The selected runtime has no authenticated local transport.'
      )
    )
  }
  if (!isSafeTimerDelayMs(timeoutMs)) {
    return Promise.reject(
      new RuntimeClientError('invalid_argument', 'Invalid transcript subscription startup timeout.')
    )
  }
  if (signal.aborted) {
    return Promise.reject(
      new RuntimeClientError('request_cancelled', 'Transcript subscription was cancelled.')
    )
  }
  return new Promise((resolve, reject) => {
    const socket = createConnection(transport.endpoint)
    const requestId = randomUUID()
    const decoder = new TextDecoder('utf-8', { fatal: true })
    let buffer = ''
    let closed = false
    let started = false
    const timeout = setTimeout(
      () =>
        fail(
          new RuntimeClientError(
            'runtime_timeout',
            'The selected host did not start its transcript subscription in time.'
          )
        ),
      timeoutMs
    )
    const cleanup = (): void => {
      clearTimeout(timeout)
      signal.removeEventListener('abort', onAbort)
      buffer = ''
      socket.destroy()
    }
    const close = (): void => {
      if (closed) {
        return
      }
      closed = true
      cleanup()
      if (!started) {
        reject(
          new RuntimeClientError(
            'request_cancelled',
            'Transcript subscription closed before it started.'
          )
        )
      }
      callbacks.onClose()
    }
    function fail(error: Error): void {
      if (closed) {
        return
      }
      closed = true
      cleanup()
      if (!started) {
        reject(error)
      }
      callbacks.onError(error)
      callbacks.onClose()
    }
    function onAbort(): void {
      fail(new RuntimeClientError('request_cancelled', 'Transcript subscription was cancelled.'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    socket.on('error', (error) =>
      fail(
        runtimeAccessDeniedError(error, metadata.pid) ??
          new RuntimeClientError(
            'runtime_unavailable',
            'Could not connect to the selected transcript host.'
          )
      )
    )
    socket.on('close', () => {
      if (!closed) {
        fail(
          new RuntimeClientError(
            'runtime_unavailable',
            'The transcript connection closed without a host end frame.'
          )
        )
      }
    })
    socket.on('data', (bytes: Buffer) => {
      if (closed) {
        return
      }
      try {
        buffer += decoder.decode(bytes, { stream: true })
        let index = buffer.indexOf('\n')
        while (index !== -1 && !closed) {
          const line = buffer.slice(0, index)
          buffer = buffer.slice(index + 1)
          if (Buffer.byteLength(line, 'utf8') > REMOTE_RUNTIME_MAX_OUTBOUND_JSON_BYTES) {
            throw new RuntimeClientError(
              'invalid_runtime_response',
              'Transcript response exceeds the JSON memory budget.'
            )
          }
          const raw: unknown = JSON.parse(line)
          if (!isKeepaliveFrame(raw)) {
            const parsed = RuntimeRpcEnvelopeSchema.safeParse(raw)
            if (!parsed.success || '_keepalive' in parsed.data || parsed.data.id !== requestId) {
              throw new RuntimeClientError(
                'invalid_runtime_response',
                'Invalid transcript response envelope or request identity.'
              )
            }
            const response = parsed.data
            if (!response.ok) {
              throw new RuntimeRpcFailureError(response)
            }
            if (response._meta.runtimeId !== metadata.runtimeId) {
              throw new RuntimeClientError(
                'runtime_unavailable',
                'The selected transcript runtime changed.'
              )
            }
            if (!started) {
              started = true
              clearTimeout(timeout)
              resolve({ close })
            }
            callbacks.onResponse(response)
          }
          index = buffer.indexOf('\n')
        }
        if (Buffer.byteLength(buffer, 'utf8') > REMOTE_RUNTIME_MAX_OUTBOUND_JSON_BYTES) {
          throw new RuntimeClientError(
            'invalid_runtime_response',
            'Transcript response exceeds the JSON memory budget.'
          )
        }
      } catch (error) {
        fail(
          error instanceof RuntimeClientError
            ? error
            : new RuntimeClientError(
                'invalid_runtime_response',
                'The transcript host returned an invalid JSON or UTF-8 frame.'
              )
        )
      }
    })
    socket.on('connect', () =>
      socket.write(
        `${JSON.stringify({ id: requestId, authToken: metadata.authToken, method: 'nativeChat.subscribe', localStream: 1, params })}\n`
      )
    )
    if (signal.aborted) {
      onAbort()
    }
  })
}
