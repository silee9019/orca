import {
  Ready,
  Changed,
  RelayChanged,
  PortsChanged,
  CredentialsChanged,
  type Row,
  type SshStateObservation,
  type ConnectionWatchResult,
  type ConnectionWatchOptions,
  validateConnectionWatchOptions
} from './connection-event-watch-contract'
export type { SshStateObservation, ConnectionWatchResult } from './connection-event-watch-contract'
import type { MobileRelayObservation } from '../../shared/mobile-relay-observation'
import type { SshPortObservation } from '../../shared/ssh-port-observation'
import type { SshCredentialObservation } from '../../shared/ssh-credential-observation'
import { createConnection } from 'node:net'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { findTransport, type RuntimeMetadata } from '../../shared/runtime-bootstrap'
import { RuntimeRpcEnvelopeSchema } from '../../shared/runtime-rpc-envelope'
import { RuntimeClientError } from './types'

export function watchConnectionEvents(
  metadata: RuntimeMetadata,
  options: ConnectionWatchOptions
): Promise<ConnectionWatchResult> {
  validateConnectionWatchOptions(options)
  const transport = findTransport(metadata, 'unix', 'named-pipe')
  if (!transport || !metadata.authToken) {
    throw new RuntimeClientError('runtime_unavailable', 'Local runtime metadata is unavailable.')
  }
  return new Promise((resolve, reject) => {
    const socket = createConnection(transport.endpoint)
    const id = randomUUID()
    const observations: SshStateObservation[] = []
    const credentialObservations: SshCredentialObservation[] = []
    const portObservations: SshPortObservation[] = []
    const mobileRelayObservations: MobileRelayObservation[] = []
    let buffer = ''
    let settled = false
    let ready = false
    const finish = (ended: ConnectionWatchResult['ended'], error?: RuntimeClientError): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', abort)
      socket.destroy()
      if (error) {
        reject(error)
      } else {
        resolve({
          requestId: id,
          runtimeId: metadata.runtimeId,
          observations,
          ...(options.observeCredentials ? { credentialObservations } : {}),
          ...(options.observePorts ? { portObservations } : {}),
          ...(options.observeMobileRelay ? { mobileRelayObservations } : {}),
          ended
        })
      }
    }
    const abort = (): void => finish('aborted')
    const timer = setTimeout(() => {
      finish(
        'duration',
        ready
          ? undefined
          : new RuntimeClientError(
              'incompatible_runtime',
              'The runtime did not start the connection subscription.'
            )
      )
    }, options.durationMs)
    const collectRelay = (value: MobileRelayObservation): void => {
      mobileRelayObservations.push(value)
      if (mobileRelayObservations.length >= options.limit) {
        finish('limit')
      }
    }
    const collectPorts = (values: SshPortObservation[]): void => {
      for (const value of values) {
        if (
          settled ||
          value.source !== options.observePorts ||
          (options.targetId && value.targetId !== options.targetId)
        ) {
          continue
        }
        portObservations.push(value)
        if (portObservations.length >= options.limit) {
          finish('limit')
          return
        }
      }
    }
    const collectCredentials = (value: SshCredentialObservation): void => {
      credentialObservations.push({
        requests: value.requests.filter(
          (request) => !options.targetId || request.targetId === options.targetId
        )
      })
      if (credentialObservations.length >= options.limit) {
        finish('limit')
      }
    }
    const collect = (rows: Row[]): void => {
      for (const row of rows) {
        if (options.targetId && row.targetId !== options.targetId) {
          continue
        }
        observations.push({ targetId: row.targetId, status: row.state.status })
        if (observations.length >= options.limit) {
          finish('limit')
          return
        }
      }
    }
    options.signal?.addEventListener('abort', abort, { once: true })
    if (options.signal?.aborted) {
      abort()
      return
    }
    socket.setEncoding('utf8')
    socket.once('error', () =>
      finish(
        'host-ended',
        new RuntimeClientError('runtime_unavailable', 'Connection observation connection failed.')
      )
    )
    socket.once('close', () => {
      if (!settled) {
        finish(
          'host-ended',
          new RuntimeClientError(
            'runtime_unavailable',
            'Connection observation connection ended. Remote execution remains unverifiable.'
          )
        )
      }
    })
    socket.on('data', (chunk: string) => {
      if (settled) {
        return
      }
      buffer += chunk
      if (Buffer.byteLength(buffer) > 1024 * 1024) {
        finish(
          'host-ended',
          new RuntimeClientError(
            'invalid_runtime_response',
            'Connection observation frame exceeds the limit.'
          )
        )
        return
      }
      let newline = buffer.indexOf('\n')
      while (newline >= 0 && !settled) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        let raw: unknown
        try {
          raw = JSON.parse(line)
        } catch {
          finish(
            'host-ended',
            new RuntimeClientError(
              'invalid_runtime_response',
              'Invalid Connection observation frame.'
            )
          )
          return
        }
        const parsed = RuntimeRpcEnvelopeSchema.safeParse(raw)
        if (!parsed.success) {
          finish(
            'host-ended',
            new RuntimeClientError(
              'invalid_runtime_response',
              'Invalid Connection observation envelope.'
            )
          )
          return
        }
        const frame = parsed.data
        if (!('_keepalive' in frame)) {
          if (frame.id !== id || frame._meta?.runtimeId !== metadata.runtimeId) {
            finish(
              'host-ended',
              new RuntimeClientError(
                'runtime_unavailable',
                'The answering runtime changed during Connection observation.'
              )
            )
            return
          }
          if (!frame.ok) {
            finish(
              'host-ended',
              new RuntimeClientError(
                frame.error.code === 'unauthorized' ? 'unauthorized' : 'incompatible_runtime',
                'The runtime could not authorize or provide connection observations.'
              )
            )
            return
          }
          const initial = Ready.safeParse(frame.result)
          if (initial.success) {
            const relaySnapshot = initial.data.snapshot?.mobileRelay
            if (options.observeMobileRelay && !relaySnapshot) {
              finish(
                'host-ended',
                new RuntimeClientError(
                  'incompatible_runtime',
                  'The runtime does not support mobile relay observations.'
                )
              )
              return
            }
            const portSnapshot = initial.data.snapshot?.sshPorts
            if (options.observePorts && !portSnapshot) {
              finish(
                'host-ended',
                new RuntimeClientError(
                  'incompatible_runtime',
                  'The runtime does not support port observations.'
                )
              )
              return
            }
            const snapshot = initial.data.snapshot?.sshCredentials
            if (options.observeCredentials && !snapshot) {
              finish(
                'host-ended',
                new RuntimeClientError(
                  'incompatible_runtime',
                  'The runtime does not support credential observations.'
                )
              )
              return
            }
            ready = true
            if (options.observeMobileRelay && relaySnapshot) {
              collectRelay(relaySnapshot)
            } else if (options.observePorts && portSnapshot) {
              collectPorts(portSnapshot)
            } else if (options.observeCredentials && snapshot) {
              collectCredentials(snapshot)
            } else {
              collect(initial.data.snapshot?.sshStates ?? [])
            }
          } else {
            const relay = RelayChanged.safeParse(frame.result)
            const port = PortsChanged.safeParse(frame.result)
            const changed = Changed.safeParse(frame.result)
            const credential = CredentialsChanged.safeParse(frame.result)
            if (relay.success && ready && options.observeMobileRelay) {
              collectRelay(relay.data.observation)
            } else if (port.success && ready && options.observePorts) {
              collectPorts([port.data.observation])
            } else if (credential.success && ready && options.observeCredentials) {
              collectCredentials(credential.data.observation)
            } else if (
              changed.success &&
              ready &&
              !options.observeCredentials &&
              !options.observePorts &&
              !options.observeMobileRelay
            ) {
              collect([changed.data])
            } else if (z.object({ type: z.literal('end') }).safeParse(frame.result).success) {
              finish(
                'host-ended',
                ready
                  ? undefined
                  : new RuntimeClientError(
                      'incompatible_runtime',
                      'The runtime ended before the observation snapshot.'
                    )
              )
            }
          }
        }
        newline = buffer.indexOf('\n')
      }
    })
    socket.once('connect', () => {
      if (!settled) {
        socket.write(
          `${JSON.stringify({ id, authToken: metadata.authToken, method: 'runtime.clientEvents.subscribe', ...(options.observeCredentials || options.observePorts || options.observeMobileRelay ? { params: { connections: options.observeCredentials, ports: Boolean(options.observePorts), relay: options.observeMobileRelay } } : {}) })}\n`
        )
      }
    })
  })
}
