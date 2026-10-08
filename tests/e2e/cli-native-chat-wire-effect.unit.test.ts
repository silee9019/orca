import { createServer, type Server, type Socket } from 'node:net'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { getEventListeners } from 'node:events'
import { join } from 'node:path'
import { z } from 'zod'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createRuntimeTransportMetadata } from '../../src/main/runtime/runtime-rpc/runtime-rpc-socket-metadata'
import type { RuntimeMetadata } from '../../src/shared/runtime-bootstrap'
import { REMOTE_RUNTIME_MAX_OUTBOUND_JSON_BYTES } from '../../src/shared/remote-runtime-memory-limits'
import type { NativeChatSubscription } from '../../src/cli/runtime/native-chat-subscription'
import { subscribeLocalNativeChat } from '../../src/cli/runtime/local-native-chat-subscription'

let root: string
let server: Server
let metadata: RuntimeMetadata
let controller: AbortController
let onRequest: (id: string, socket: Socket) => void
let sessions: NativeChatSubscription[]
let sockets: Set<Socket>
const callbacks = { onResponse: vi.fn(), onError: vi.fn(), onClose: vi.fn() }
const connected = vi.fn()
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-native-client-'))
  const runtimeId = randomUUID()
  const transport = createRuntimeTransportMetadata(root, process.pid, process.platform, runtimeId)
  metadata = {
    runtimeId,
    pid: process.pid,
    authToken: 'fixture-only',
    transports: [transport],
    startedAt: 1,
    nativeChatStreaming: 1
  }
  controller = new AbortController()
  sessions = []
  sockets = new Set()
  for (const mock of [connected, ...Object.values(callbacks)]) {
    mock.mockReset()
  }
  onRequest = () => {}
  server = createServer((socket) => {
    connected()
    sockets.add(socket)
    socket.on('error', () => {})
    socket.once('close', () => sockets.delete(socket))
    let buffer = ''
    socket.on('data', (bytes) => {
      buffer += bytes.toString('utf8')
      const index = buffer.indexOf('\n')
      if (index === -1) {
        return
      }
      const request = z.object({ id: z.string() }).parse(JSON.parse(buffer.slice(0, index)))
      buffer = buffer.slice(index + 1)
      onRequest(request.id, socket)
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(transport.endpoint, resolve)
  })
})
afterEach(async () => {
  for (const session of sessions) {
    session.close()
  }
  for (const socket of sockets) {
    socket.destroy()
  }
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  )
  await rm(root, { recursive: true, force: true })
})
async function open(timeoutMs = 1000) {
  const session = await subscribeLocalNativeChat(
    metadata,
    { agent: 'claude', sessionId: 'fixture' },
    timeoutMs,
    callbacks,
    controller.signal
  )
  sessions.push(session)
  return session
}
function frame(id: string, result: unknown, runtimeId = metadata.runtimeId) {
  return Buffer.from(`${JSON.stringify({ id, ok: true, result, _meta: { runtimeId } })}\n`)
}
it('preserves UTF-8 across socket chunk boundaries and removes its abort listener on close', async () => {
  onRequest = (id, socket) => {
    const bytes = frame(id, { type: 'snapshot', text: '한글 private fixture' })
    const boundary = bytes.indexOf(Buffer.from('한')) + 1
    socket.write(bytes.subarray(0, boundary))
    setImmediate(() => socket.write(bytes.subarray(boundary)))
  }
  const session = await open()
  expect(callbacks.onResponse).toHaveBeenCalledWith(
    expect.objectContaining({ result: { type: 'snapshot', text: '한글 private fixture' } })
  )
  session.close()
  expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0)
  expect(callbacks.onClose).toHaveBeenCalledOnce()
})
it.each([
  ['request identity', 'invalid_runtime_response'],
  ['runtime identity', 'runtime_unavailable'],
  ['invalid JSON', 'invalid_runtime_response'],
  ['invalid UTF-8', 'invalid_runtime_response'],
  ['oversized frame', 'invalid_runtime_response']
])('refuses %s without accepting a transcript event', async (kind, code) => {
  onRequest = (id, socket) => {
    if (kind === 'request identity') {
      socket.write(frame('wrong', {}))
    }
    if (kind === 'runtime identity') {
      socket.write(frame(id, {}, 'wrong-runtime'))
    }
    if (kind === 'invalid JSON') {
      socket.write('{invalid-private-fixture\n')
    }
    if (kind === 'invalid UTF-8') {
      const bytes = frame(id, { type: 'snapshot', text: '한글 private invalid fixture' })
      bytes[bytes.indexOf(Buffer.from('한'))] = 0xff
      socket.write(bytes)
    }
    if (kind === 'oversized frame') {
      socket.write(
        frame(id, { type: 'snapshot', text: 'x'.repeat(REMOTE_RUNTIME_MAX_OUTBOUND_JSON_BYTES) })
      )
    }
  }
  await expect(open()).rejects.toMatchObject({ code })
  expect(callbacks.onResponse).not.toHaveBeenCalled()
  expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0)
})
it('does not open a connection when already cancelled', async () => {
  controller.abort()
  await expect(open()).rejects.toMatchObject({ code: 'request_cancelled' })
  expect(connected).not.toHaveBeenCalled()
})
it('cancels a connection that has not yet sent its first frame', async () => {
  onRequest = () => controller.abort()
  await expect(open()).rejects.toMatchObject({ code: 'request_cancelled' })
  expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0)
  expect(callbacks.onClose).toHaveBeenCalledOnce()
})
it('keeps startup bounded even when the peer only emits keepalives', async () => {
  onRequest = (_id, socket) => {
    const interval = setInterval(() => socket.write('{"_keepalive":true}\n'), 5)
    socket.once('close', () => clearInterval(interval))
  }
  await expect(open(30)).rejects.toMatchObject({ code: 'runtime_timeout' })
  expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0)
})
it('preserves an explicit old-host streaming refusal', async () => {
  onRequest = (id, socket) =>
    socket.write(
      `${JSON.stringify({ id, ok: false, error: { code: 'method_not_supported', message: 'fixture old host' }, _meta: { runtimeId: metadata.runtimeId } })}\n`
    )
  await expect(open()).rejects.toMatchObject({ code: 'method_not_supported' })
  expect(callbacks.onResponse).not.toHaveBeenCalled()
})
