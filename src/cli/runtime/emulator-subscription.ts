import { createConnection } from 'node:net'
import { randomUUID } from 'node:crypto'
import type { RuntimeMetadata } from '../../shared/runtime-bootstrap'
import { findTransport } from '../../shared/runtime-bootstrap'
import type { PairingOffer } from '../../shared/pairing'
import { subscribeRemoteRuntimeRequest } from '../../shared/remote-runtime-client'
import { RuntimeRpcEnvelopeSchema } from '../../shared/runtime-rpc-envelope'
import { RuntimeClientError, RuntimeRpcFailureError } from './types'

export type EmulatorSubscriptionArguments = [
  method: 'emulator.startFrameStream' | 'emulator.startVideoStream',
  params: { worktree: string; timeoutMs: number },
  onResult: (result: unknown) => void,
  signal: AbortSignal
]

export async function consumeEmulatorStream(
  metadata: RuntimeMetadata | null,
  pairing: PairingOffer | null,
  [method, params, onResult, signal]: EmulatorSubscriptionArguments
): Promise<void> {
  await consumeEmulatorSubscription({ metadata, pairing, method, params, onResult, signal })
}

export async function consumeEmulatorSubscription(args: {
  metadata: RuntimeMetadata | null
  pairing: PairingOffer | null
  method: 'emulator.startFrameStream' | 'emulator.startVideoStream'
  params: { worktree: string; timeoutMs: number }
  onResult: (result: unknown) => void
  signal: AbortSignal
}): Promise<void> {
  if (args.signal.aborted) {
    return
  }
  await new Promise<void>((resolve, reject) => {
    let settled = false
    let close = (): void => {}
    const finish = (error?: Error): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      args.signal.removeEventListener('abort', onAbort)
      close()
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    }
    const onAbort = (): void => finish()
    const timer = setTimeout(
      () =>
        finish(
          new RuntimeClientError(
            'runtime_timeout',
            'Emulator stream exceeded its response deadline.'
          )
        ),
      args.params.timeoutMs + 5000
    )
    args.signal.addEventListener('abort', onAbort, { once: true })
    const accept = (raw: unknown, requestId?: string): void => {
      if (settled) {
        return
      }
      const parsed = RuntimeRpcEnvelopeSchema.safeParse(raw)
      if (!parsed.success) {
        finish(
          new RuntimeClientError('invalid_runtime_response', 'Invalid emulator stream response')
        )
        return
      }
      const response = parsed.data
      if ('_keepalive' in response) {
        return
      }
      if (
        (requestId && response.id !== requestId) ||
        (args.metadata && response._meta?.runtimeId !== args.metadata.runtimeId)
      ) {
        finish(
          new RuntimeClientError(
            'invalid_runtime_response',
            'Emulator stream response identity changed'
          )
        )
        return
      }
      if (!response.ok) {
        finish(new RuntimeRpcFailureError(response))
        return
      }
      try {
        args.onResult(response.result)
        if (
          response.result &&
          typeof response.result === 'object' &&
          'type' in response.result &&
          response.result.type === 'end'
        ) {
          finish()
        }
      } catch (error) {
        finish(error instanceof Error ? error : new Error('Emulator stream output failed'))
      }
    }
    if (args.pairing) {
      void subscribeRemoteRuntimeRequest(
        args.pairing,
        args.method,
        args.params,
        args.params.timeoutMs + 5000,
        {
          onResponse: (response) => accept(response),
          onError: (error) => finish(new RuntimeClientError(error.code, error.message)),
          onClose: () =>
            finish(
              new RuntimeClientError(
                'runtime_unavailable',
                'Emulator stream closed before completion'
              )
            )
        },
        { signal: args.signal }
      ).then(
        (subscription) => {
          close = subscription.close
          if (settled) {
            close()
          }
        },
        (error: unknown) =>
          finish(error instanceof Error ? error : new Error('Emulator stream connection failed'))
      )
      return
    }
    const transport = args.metadata && findTransport(args.metadata, 'unix', 'named-pipe')
    if (!transport) {
      finish(new RuntimeClientError('runtime_unavailable', 'No local emulator streaming transport'))
      return
    }
    const socket = createConnection(transport.endpoint)
    close = () => socket.destroy()
    const requestId = randomUUID()
    let pending = ''
    socket.setEncoding('utf8')
    socket.on('connect', () =>
      socket.write(
        `${JSON.stringify({ id: requestId, authToken: args.metadata?.authToken, method: args.method, params: args.params })}\n`
      )
    )
    socket.on('data', (chunk) => {
      pending += chunk.toString()
      if (pending.length > 32 * 1024 * 1024) {
        finish(
          new RuntimeClientError('invalid_runtime_response', 'Emulator stream frame is too large')
        )
        return
      }
      let end = pending.indexOf('\n')
      while (end >= 0 && !settled) {
        const line = pending.slice(0, end)
        pending = pending.slice(end + 1)
        try {
          accept(JSON.parse(line), requestId)
        } catch {
          finish(new RuntimeClientError('invalid_runtime_response', 'Invalid emulator stream JSON'))
        }
        end = pending.indexOf('\n')
      }
    })
    socket.on('error', () =>
      finish(
        new RuntimeClientError(
          'runtime_unavailable',
          'Could not connect to the selected emulator host'
        )
      )
    )
    socket.on('close', () =>
      finish(
        new RuntimeClientError('runtime_unavailable', 'Emulator stream closed before completion')
      )
    )
  })
}
