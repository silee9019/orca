import { createServer, type Socket } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { afterEach, expect, it } from 'vitest'
import { watchSshState } from './ssh-state-watch'
import { watchConnectionEvents } from './connection-event-watch'
import type { RuntimeMetadata } from '../../shared/runtime-bootstrap'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).toReversed()) {
    await cleanup()
  }
})
async function fixture(
  emit: (
    reply: (result: unknown, runtimeId?: string) => void,
    socket: Socket,
    connections?: boolean,
    ports?: boolean,
    relay?: boolean
  ) => void,
  failure?: { code: string; message: string }
) {
  const dir = await mkdtemp(join(tmpdir(), 'orca-ssh-watch-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  const endpoint =
    process.platform === 'win32'
      ? `\\\\.\\pipe\\orca-watch-${randomUUID()}`
      : join(dir, 'watch.sock')
  const sockets = new Set<Socket>()
  let closed = 0
  const server = createServer((socket) => {
    sockets.add(socket)
    socket.once('close', () => {
      sockets.delete(socket)
      closed++
    })
    socket.setEncoding('utf8')
    socket.once('data', (raw) => {
      const request = z
        .object({
          id: z.string(),
          authToken: z.literal('fixture-token'),
          method: z.literal('runtime.clientEvents.subscribe'),
          params: z
            .object({
              connections: z.boolean().optional(),
              ports: z.boolean().optional(),
              relay: z.boolean().optional()
            })
            .optional()
        })
        .parse(JSON.parse(String(raw)))
      emit(
        (result, runtimeId = 'watch-fixture') =>
          socket.write(
            `${JSON.stringify(failure ? { id: request.id, ok: false, error: failure, _meta: { runtimeId } } : { id: request.id, ok: true, result, _meta: { runtimeId } })}\n`
          ),
        socket,
        request.params?.connections,
        request.params?.ports,
        request.params?.relay
      )
    })
  })
  await new Promise<void>((resolve) => server.listen(endpoint, resolve))
  cleanups.push(async () => {
    for (const socket of sockets) {
      socket.destroy()
    }
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })
  const metadata: RuntimeMetadata = {
    runtimeId: 'watch-fixture',
    pid: process.pid,
    startedAt: 0,
    authToken: 'fixture-token',
    transports: [{ kind: process.platform === 'win32' ? 'named-pipe' : 'unix', endpoint }]
  }
  return { metadata, closed: () => closed }
}
const ready = {
  type: 'ready',
  subscriptionId: 'sub-a',
  snapshot: {
    sshStates: [
      { targetId: 'host-a', state: { status: 'connected', error: 'private-state-canary' } }
    ]
  }
}
it('observes the listener-first snapshot and later SSH changes while stripping private and unrelated payloads', async () => {
  const owner = await fixture((reply) => {
    reply(ready)
    reply({ type: 'terminalSideEffects', batch: { secret: 'private-terminal-canary' } })
    reply({ type: 'futureEvent', secret: 'private-future-canary' })
    reply({ type: 'sshStateChanged', targetId: 'host-b', state: { status: 'error' } })
    reply({
      type: 'sshStateChanged',
      targetId: 'host-a',
      state: { status: 'reconnecting', error: 'private-state-canary' }
    })
  })
  const result = await watchSshState(owner.metadata, {
    durationMs: 1000,
    limit: 2,
    targetId: 'host-a'
  })
  expect(result).toMatchObject({
    ended: 'limit',
    observations: [
      { targetId: 'host-a', status: 'connected' },
      { targetId: 'host-a', status: 'reconnecting' }
    ]
  })
  expect(JSON.stringify(result)).not.toContain('private-')
})
it('releases its socket on abort and cannot receive a previous subscription incarnation', async () => {
  const owner = await fixture((reply) => reply(ready))
  const abort = new AbortController()
  const pending = watchSshState(owner.metadata, {
    durationMs: 1000,
    limit: 100,
    signal: abort.signal
  })
  await new Promise<void>((resolve) => setTimeout(resolve, 20))
  abort.abort()
  await expect(pending).resolves.toMatchObject({ ended: 'aborted' })
  await new Promise<void>((resolve) => setTimeout(resolve, 20))
  expect(owner.closed()).toBe(1)
  const second = await watchSshState(owner.metadata, { durationMs: 30, limit: 100 })
  expect(second.observations).toHaveLength(1)
  expect(second.ended).toBe('duration')
})
it('rejects a changed runtime incarnation without echoing the frame', async () => {
  const owner = await fixture((reply) =>
    reply({ ...ready, private: 'secret-incarnation-canary' }, 'replacement')
  )
  await expect(watchSshState(owner.metadata, { durationMs: 1000, limit: 100 })).rejects.toThrow(
    'answering runtime changed'
  )
})
it('does not label an old unary peer as a working watcher', async () => {
  const owner = await fixture((_reply, socket) => socket.end())
  await expect(watchSshState(owner.metadata, { durationMs: 100, limit: 100 })).rejects.toThrow(
    'unverifiable'
  )
})
it('rejects bounds before connecting and caps retained frame bytes', async () => {
  const owner = await fixture((_reply, socket) => socket.write('x'.repeat(1024 * 1024 + 1)))
  expect(() => watchSshState(owner.metadata, { durationMs: 0, limit: 100 })).toThrow('duration')
  expect(() => watchSshState(owner.metadata, { durationMs: 10, limit: 1001 })).toThrow('limit')
  await expect(watchSshState(owner.metadata, { durationMs: 1000, limit: 100 })).rejects.toThrow(
    'frame exceeds'
  )
})

it('observes private-safe credential request and resolution snapshots on an explicit local subscription', async () => {
  const owner = await fixture((reply, _socket, connections) => {
    expect(connections).toBe(true)
    reply({
      ...ready,
      snapshot: {
        ...ready.snapshot,
        sshCredentials: {
          requests: [
            {
              requestId: 'request-a',
              targetId: 'host-a',
              kind: 'password',
              detail: 'private-prompt-canary',
              value: 'private-value-canary'
            }
          ]
        }
      }
    })
    reply({ type: 'sshCredentialsChanged', observation: { requests: [] } })
  })
  const result = await watchSshState(owner.metadata, {
    durationMs: 1000,
    limit: 2,
    observeCredentials: true
  })
  expect(result).toMatchObject({
    ended: 'limit',
    observations: [],
    credentialObservations: [
      { requests: [{ requestId: 'request-a', targetId: 'host-a', kind: 'password' }] },
      { requests: [] }
    ]
  })
  expect(JSON.stringify(result)).not.toContain('private-')
})
it('fails explicitly when an older runtime cannot provide credential snapshots', async () => {
  const owner = await fixture((reply) => reply(ready))
  await expect(
    watchSshState(owner.metadata, { durationMs: 1000, limit: 100, observeCredentials: true })
  ).rejects.toThrow('does not support credential observations')
})

it.each(['forwards', 'detected'] as const)(
  'observes canonical %s snapshots and later notifications without private fields',
  async (source) => {
    const initial =
      source === 'forwards'
        ? {
            source,
            targetId: 'host-a',
            forwards: [
              {
                id: 'forward-a',
                localPort: 3000,
                remotePort: 3000,
                remoteHost: 'private-host-canary',
                label: 'private-label-canary'
              }
            ]
          }
        : { source, targetId: 'host-a', ports: [3000], processName: 'private-process-canary' }
    const changed =
      source === 'forwards'
        ? { source, targetId: 'host-a', forwards: [] }
        : { source, targetId: 'host-a', ports: [3001] }
    const owner = await fixture((reply, _socket, _connections, ports) => {
      expect(ports).toBe(true)
      reply({ ...ready, snapshot: { ...ready.snapshot, sshPorts: [initial] } })
      reply({ type: 'sshPortsChanged', observation: changed })
    })
    const result = await watchSshState(owner.metadata, {
      durationMs: 1000,
      limit: 2,
      observePorts: source,
      targetId: 'host-a'
    })
    expect(result).toMatchObject({
      ended: 'limit',
      observations: [],
      portObservations: [expect.objectContaining({ source, targetId: 'host-a' }), changed]
    })
    expect(JSON.stringify(result)).not.toContain('private-')
  }
)
it('does not treat a peer without the port snapshot extension as a supported watcher', async () => {
  const owner = await fixture((reply) => reply(ready))
  await expect(
    watchSshState(owner.metadata, { durationMs: 1000, limit: 100, observePorts: 'forwards' })
  ).rejects.toThrow('does not support port observations')
})

it('observes canonical relay snapshots and live changes without private cell URLs', async () => {
  const owner = await fixture((reply, _socket, _connections, _ports, relay) => {
    expect(relay).toBe(true)
    reply({
      type: 'ready',
      subscriptionId: 'relay-a',
      snapshot: { mobileRelay: { status: 'registered', cellUrl: 'private-cell-canary' } }
    })
    reply({
      type: 'mobileRelayChanged',
      observation: { status: 'draining', cellUrl: 'private-cell-canary' }
    })
  })
  const result = await watchConnectionEvents(owner.metadata, {
    durationMs: 1000,
    limit: 2,
    observeMobileRelay: true
  })
  expect(result).toMatchObject({
    ended: 'limit',
    observations: [],
    mobileRelayObservations: [{ status: 'registered' }, { status: 'draining' }]
  })
  expect(JSON.stringify(result)).not.toContain('private-')
})
it('rejects old peers without relay snapshot support and releases the socket', async () => {
  const owner = await fixture((reply) => reply(ready))
  await expect(
    watchConnectionEvents(owner.metadata, { durationMs: 1000, limit: 2, observeMobileRelay: true })
  ).rejects.toMatchObject({ code: 'incompatible_runtime' })
  await new Promise<void>((resolve) => setTimeout(resolve, 20))
  expect(owner.closed()).toBe(1)
})

it('preserves explicit authentication refusal while hiding the remote error message', async () => {
  const owner = await fixture((reply) => reply(null), {
    code: 'unauthorized',
    message: 'private-auth-canary'
  })
  try {
    await watchConnectionEvents(owner.metadata, {
      durationMs: 1000,
      limit: 2,
      observeMobileRelay: true
    })
    throw new Error('expected authentication refusal')
  } catch (error) {
    expect(error).toMatchObject({ code: 'unauthorized' })
    expect(String(error)).not.toContain('private-auth-canary')
  }
})
