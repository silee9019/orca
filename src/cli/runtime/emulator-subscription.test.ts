import { createServer, type Socket } from 'node:net'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { consumeEmulatorSubscription } from './emulator-subscription'
import {
  createSharedControlTestServer,
  closeSharedControlTestServers
} from '../../shared/remote-runtime-shared-control-test-server'
import type { RuntimeMetadata } from '../../shared/runtime-bootstrap'

const params = { worktree: 'folder:mobile', timeoutMs: 1000 }
const Request = z.object({ id: z.string(), method: z.string(), params: z.unknown() })
afterEach(closeSharedControlTestServers)

async function withSocket(
  respond: (socket: Socket, request: z.infer<typeof Request>) => void,
  check: (metadata: RuntimeMetadata, closed: Promise<void>) => Promise<void>
): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'orca-emulator-stream-'))
  const endpoint = path.join(dir, 'stream.sock')
  let recordClose = (): void => {}
  const closed = new Promise<void>((resolve) => {
    recordClose = resolve
  })
  const server = createServer((socket) => {
    socket.once('close', recordClose)
    socket.setEncoding('utf8')
    let pending = ''
    socket.on('data', (chunk) => {
      pending += chunk.toString()
      const end = pending.indexOf('\n')
      if (end !== -1) {
        respond(socket, Request.parse(JSON.parse(pending.slice(0, end))))
      }
    })
  })
  server.listen(endpoint)
  await once(server, 'listening')
  try {
    await check(
      {
        runtimeId: 'fixture',
        pid: process.pid,
        authToken: 'fixture',
        transports: [{ kind: 'unix', endpoint }],
        startedAt: Date.now()
      },
      closed
    )
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
    await rm(dir, { recursive: true, force: true })
  }
}

describe('emulator CLI streaming transport', () => {
  it('cancels the real local socket after a frame without changing device state', async () => {
    await withSocket(
      (socket, request) =>
        socket.write(
          `${JSON.stringify({ id: request.id, ok: true, result: { type: 'frame', data: 'AQI=' }, _meta: { runtimeId: 'fixture' } })}\n`
        ),
      async (metadata, closed) => {
        const controller = new AbortController()
        const received: unknown[] = []
        await consumeEmulatorSubscription({
          metadata,
          pairing: null,
          method: 'emulator.startFrameStream',
          params,
          signal: controller.signal,
          onResult: (result) => {
            received.push(result)
            controller.abort()
          }
        })
        await closed
        expect(received).toEqual([{ type: 'frame', data: 'AQI=' }])
      }
    )
  })

  it('surfaces an old host error instead of accepting a stream', async () => {
    await withSocket(
      (socket, request) =>
        socket.end(
          `${JSON.stringify({ id: request.id, ok: false, error: { code: 'method_not_found', message: 'Old host has no emulator stream' }, _meta: { runtimeId: 'fixture' } })}\n`
        ),
      async (metadata) => {
        await expect(
          consumeEmulatorSubscription({
            metadata,
            pairing: null,
            method: 'emulator.startFrameStream',
            params,
            signal: new AbortController().signal,
            onResult: () => {
              throw new Error('Unexpected success')
            }
          })
        ).rejects.toMatchObject({ code: 'method_not_found' })
      }
    )
  })

  it('rejects mismatched local runtime identity', async () => {
    await withSocket(
      (socket, request) =>
        socket.end(
          `${JSON.stringify({ id: request.id, ok: true, result: { type: 'frame' }, _meta: { runtimeId: 'wrong-host' } })}\n`
        ),
      async (metadata) => {
        await expect(
          consumeEmulatorSubscription({
            metadata,
            pairing: null,
            method: 'emulator.startFrameStream',
            params,
            signal: new AbortController().signal,
            onResult: () => {}
          })
        ).rejects.toMatchObject({ code: 'invalid_runtime_response' })
      }
    )
  })

  it('authenticates through the existing remote E2EE transport and cancels its subscription', async () => {
    const server = await createSharedControlTestServer({
      resultForRequest: () => ({ type: 'frame', data: 'AQI=' })
    })
    const controller = new AbortController()
    const received: unknown[] = []
    await consumeEmulatorSubscription({
      metadata: null,
      pairing: server.pairing,
      method: 'emulator.startVideoStream',
      params,
      signal: controller.signal,
      onResult: (result) => {
        received.push(result)
        controller.abort()
      }
    })
    expect(server.requests).toEqual([
      expect.objectContaining({ method: 'emulator.startVideoStream', params })
    ])
    expect(server.auths).toEqual([
      expect.objectContaining({ type: 'e2ee_auth', deviceToken: server.pairing.deviceToken })
    ])
    expect(received).toEqual([{ type: 'frame', data: 'AQI=' }])
  })

  it('reports an unexpected remote close as unavailable', async () => {
    const server = await createSharedControlTestServer({ closeBeforeResponse: true })
    await expect(
      consumeEmulatorSubscription({
        metadata: null,
        pairing: server.pairing,
        method: 'emulator.startVideoStream',
        params,
        signal: new AbortController().signal,
        onResult: () => {}
      })
    ).rejects.toMatchObject({ code: 'runtime_unavailable' })
  })
})
