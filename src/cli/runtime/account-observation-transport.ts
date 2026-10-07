import { createConnection, type Socket } from 'node:net'
import { randomUUID } from 'node:crypto'
import type { PairingOffer } from '../../shared/pairing'
import { findTransport } from '../../shared/runtime-bootstrap'
import {
  RuntimeRpcEnvelopeSchema,
  type RuntimeRpcResponse
} from '../../shared/runtime-rpc-envelope'
import {
  CodexLoginObservationEventSchema,
  type CodexLoginObservationEvent
} from '../../shared/codex-login-observation'
import {
  subscribeRemoteRuntimeRequest,
  type RemoteRuntimeSubscription
} from '../../shared/remote-runtime-client'
import { readMetadata } from './metadata'
import { RuntimeClientError, RuntimeRpcFailureError } from './types'

async function observeAccountTransport(
  userDataPath: string,
  pairing: PairingOffer | null,
  timeoutMs: number,
  signal: AbortSignal,
  onFrame: (frame: unknown) => void,
  method: 'accounts.observeCodexLogin' | 'rateLimits.subscribe' | 'macosTccPrompts.observeThreshold'
): Promise<'timeout' | 'cancelled'> {
  if (signal.aborted) {
    return 'cancelled'
  }
  const metadata = pairing ? null : readMetadata(userDataPath)
  const transport = metadata ? findTransport(metadata, 'unix', 'named-pipe') : null
  if (!pairing && !transport) {
    throw new RuntimeClientError('runtime_unavailable', 'No compatible account observer transport')
  }
  return new Promise((resolve, reject) => {
    let socket: Socket | undefined
    let remote: RemoteRuntimeSubscription | undefined
    let closed = false
    let ready = false
    let runtimeId = metadata?.runtimeId
    let buffer = ''
    const requestId = randomUUID()
    const lifetime = new AbortController()
    const finish = (reason: 'timeout' | 'cancelled' | Error): void => {
      if (closed) {
        return
      }
      closed = true
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      lifetime.abort()
      remote?.close()
      socket?.destroy()
      buffer = ''
      if (reason instanceof Error) {
        reject(reason)
      } else {
        resolve(reason)
      }
    }
    const onAbort = () => finish('cancelled')
    const timer = setTimeout(
      () =>
        finish(
          ready
            ? 'timeout'
            : new RuntimeClientError('runtime_timeout', 'Account observation did not become ready')
        ),
      timeoutMs
    )
    signal.addEventListener('abort', onAbort, { once: true })
    const receive = (response: RuntimeRpcResponse<unknown>): void => {
      if (closed) {
        return
      }
      if (!response.ok) {
        finish(new RuntimeRpcFailureError(response))
        return
      }
      if (runtimeId !== undefined && response._meta.runtimeId !== runtimeId) {
        finish(new RuntimeClientError('runtime_unavailable', 'Observed runtime changed'))
        return
      }
      runtimeId = response._meta.runtimeId
      try {
        onFrame(response.result)
        ready = true
      } catch {
        finish(
          new RuntimeClientError('invalid_runtime_response', 'Account observation consumer failed')
        )
      }
    }
    if (pairing) {
      void subscribeRemoteRuntimeRequest(
        pairing,
        method,
        undefined,
        Math.min(timeoutMs, 10000),
        {
          onResponse: receive,
          onError: (error) => finish(error),
          onClose: () =>
            finish(
              new RuntimeClientError('runtime_unavailable', 'Account observation stream closed')
            )
        },
        { signal: lifetime.signal }
      ).then(
        (subscription) => {
          remote = subscription
          if (closed) {
            subscription.close()
          }
        },
        (error) => {
          if (!closed) {
            finish(
              error instanceof Error
                ? error
                : new RuntimeClientError('runtime_unavailable', 'Account observation failed')
            )
          }
        }
      )
    } else if (transport && metadata) {
      socket = createConnection(transport.endpoint)
      socket.setEncoding('utf8')
      socket.once('error', () =>
        finish(
          new RuntimeClientError('runtime_unavailable', 'Account observation connection failed')
        )
      )
      socket.once('close', () =>
        finish(new RuntimeClientError('runtime_unavailable', 'Account observation stream closed'))
      )
      socket.on('data', (chunk: string) => {
        if (closed) {
          return
        }
        buffer += chunk
        while (!closed) {
          const newline = buffer.indexOf('\n')
          if (newline === -1) {
            if (Buffer.byteLength(buffer) > 65536) {
              finish(
                new RuntimeClientError(
                  'invalid_runtime_response',
                  'Account observation frame exceeds size limit'
                )
              )
            }
            return
          }
          if (Buffer.byteLength(buffer.slice(0, newline)) > 65536) {
            finish(
              new RuntimeClientError(
                'invalid_runtime_response',
                'Account observation frame exceeds size limit'
              )
            )
            return
          }
          const line = buffer.slice(0, newline)
          buffer = buffer.slice(newline + 1)
          if (!line.trim()) {
            continue
          }
          let raw: unknown
          try {
            raw = JSON.parse(line)
          } catch {
            finish(
              new RuntimeClientError(
                'invalid_runtime_response',
                'Invalid Account observation JSON frame'
              )
            )
            return
          }
          const parsed = RuntimeRpcEnvelopeSchema.safeParse(raw)
          if (!parsed.success) {
            finish(
              new RuntimeClientError(
                'invalid_runtime_response',
                'Invalid Account observation envelope'
              )
            )
            return
          }
          const frame = parsed.data
          if ('_keepalive' in frame) {
            continue
          }
          if (frame.id !== requestId) {
            finish(
              new RuntimeClientError(
                'invalid_runtime_response',
                'Mismatched Account observation response id'
              )
            )
            return
          }
          receive(frame)
        }
      })
      socket.once('connect', () => {
        if (!closed) {
          socket?.write(
            `${JSON.stringify({
              id: requestId,
              authToken: metadata.authToken,
              method
            })}\n`
          )
        }
      })
    }
    if (signal.aborted) {
      onAbort()
    }
  })
}

export function observeCodexLoginTransport(
  userDataPath: string,
  pairing: PairingOffer | null,
  timeoutMs: number,
  signal: AbortSignal,
  onEvent: (event: CodexLoginObservationEvent) => void
): Promise<'timeout' | 'cancelled'> {
  let revision = -1
  return observeAccountTransport(
    userDataPath,
    pairing,
    timeoutMs,
    signal,
    (frame) => {
      const parsed = CodexLoginObservationEventSchema.safeParse(frame)
      if (
        !parsed.success ||
        parsed.data.type !== (revision === -1 ? 'ready' : 'changed') ||
        parsed.data.revision !== revision + 1
      ) {
        throw new Error('Invalid Codex observation frame')
      }
      revision = parsed.data.revision
      onEvent(parsed.data)
    },
    'accounts.observeCodexLogin'
  )
}

export function observeRateLimitTransport(
  userDataPath: string,
  pairing: PairingOffer | null,
  timeoutMs: number,
  signal: AbortSignal,
  onFrame: (frame: unknown) => void
): Promise<'timeout' | 'cancelled'> {
  return observeAccountTransport(
    userDataPath,
    pairing,
    timeoutMs,
    signal,
    onFrame,
    'rateLimits.subscribe'
  )
}

export function observeTccThresholdTransport(
  userDataPath: string,
  pairing: PairingOffer | null,
  timeoutMs: number,
  signal: AbortSignal,
  onFrame: (frame: unknown) => void
): Promise<'timeout' | 'cancelled'> {
  return observeAccountTransport(
    userDataPath,
    pairing,
    timeoutMs,
    signal,
    onFrame,
    'macosTccPrompts.observeThreshold'
  )
}

export function createCodexLoginObserver(userDataPath: string, pairing: PairingOffer | null) {
  return observeCodexLoginTransport.bind(null, userDataPath, pairing)
}
export function createRateLimitObserver(userDataPath: string, pairing: PairingOffer | null) {
  return observeRateLimitTransport.bind(null, userDataPath, pairing)
}
export function createTccThresholdObserver(userDataPath: string, pairing: PairingOffer | null) {
  return observeTccThresholdTransport.bind(null, userDataPath, pairing)
}
