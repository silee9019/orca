import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import { createConnection, type Socket } from 'node:net'
import { mkdtemp, writeFile, appendFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineMethod, defineStreamingMethod } from '../../src/main/runtime/rpc/core'
import { REMOTE_RUNTIME_MAX_OUTBOUND_JSON_BYTES } from '../../src/shared/remote-runtime-memory-limits'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { OrcaRuntimeRpcServer } from '../../src/main/runtime/runtime-rpc'
import { NATIVE_CHAT_METHODS } from '../../src/main/runtime/rpc/methods/native-chat'
import { getActiveNativeChatWatcherCount } from '../../src/main/native-chat/transcript-watch'
import { readMetadata } from '../../src/cli/runtime/metadata'
import { findTransport } from '../../src/shared/runtime-bootstrap'

let root: string
let server: OrcaRuntimeRpcServer
let transcript: string
let sockets: Socket[]
let watcherBaseline: number
function line(uuid: string, text: string): string {
  return `${JSON.stringify({
    type: 'user',
    uuid,
    timestamp: '2026-10-08T08:30:00.000Z',
    message: { role: 'user', content: text }
  })}\n`
}
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-local-transcript-stream-'))
  sockets = []
  watcherBaseline = getActiveNativeChatWatcherCount()
  transcript = join(root, 'fixture.jsonl')
  await writeFile(transcript, line('fixture-first', 'private transcript fixture'))
  server = new OrcaRuntimeRpcServer({
    runtime: new OrcaRuntimeService(),
    userDataPath: root,
    enableWebSocket: false,
    methods: NATIVE_CHAT_METHODS,
    keepaliveIntervalMs: 25
  })
  await server.start()
})
afterEach(async () => {
  for (const socket of sockets) {
    socket.destroy()
  }
  await server.stop()
  await vi.waitFor(() => expect(getActiveNativeChatWatcherCount()).toBe(watcherBaseline))
  await rm(root, { recursive: true, force: true })
})
function connect(overrides: Record<string, unknown> = {}) {
  const metadata = readMetadata(root)
  const transport = findTransport(metadata, 'unix', 'named-pipe')
  if (!transport) {
    throw new Error('fixture transport missing')
  }
  const socket = createConnection(transport.endpoint)
  sockets.push(socket)
  const frames: unknown[] = []
  const errors: Error[] = []
  let buffer = ''
  socket.setEncoding('utf8')
  socket.on('error', (error) => errors.push(error))
  socket.on('data', (chunk: string) => {
    buffer += chunk
    let index = buffer.indexOf('\n')
    while (index !== -1) {
      const frame: unknown = JSON.parse(buffer.slice(0, index))
      frames.push(frame)
      buffer = buffer.slice(index + 1)
      index = buffer.indexOf('\n')
    }
  })
  socket.on('connect', () =>
    socket.write(
      `${JSON.stringify({
        id: 'fixture-watch',
        authToken: metadata.authToken,
        method: 'nativeChat.subscribe',
        localStream: 1,
        params: {
          agent: 'claude',
          sessionId: 'fixture',
          transcriptPath: transcript,
          subscriptionId: 'fixture-owned',
          capabilities: { transcriptPending: 1 }
        },
        ...overrides
      })}\n`
    )
  )
  return { socket, frames, errors }
}
it('advertises native transcript streaming only in the isolated runtime metadata', () => {
  expect(readMetadata(root)).toMatchObject({ nativeChatStreaming: 1, pid: process.pid })
  expect([3198, 3278]).not.toContain(process.pid)
})
it('delivers the canonical snapshot and live append over one local connection', async () => {
  const { socket, frames, errors } = connect()
  await vi.waitFor(() =>
    expect(frames).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ok: true,
          result: expect.objectContaining({
            type: 'snapshot',
            messages: expect.arrayContaining([expect.objectContaining({ id: 'fixture-first' })])
          })
        })
      ])
    )
  )
  await appendFile(transcript, line('fixture-second', 'private appended fixture'))
  await vi.waitFor(() =>
    expect(frames).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ok: true,
          result: expect.objectContaining({
            type: 'appended',
            messages: expect.arrayContaining([expect.objectContaining({ id: 'fixture-second' })])
          })
        })
      ])
    )
  )
  expect(errors).toEqual([])
  socket.destroy()
  await vi.waitFor(() => expect(getActiveNativeChatWatcherCount()).toBe(watcherBaseline))
})
it('closing one connection preserves another connection’s canonical watcher', async () => {
  const first = connect()
  const secondTranscript = join(root, 'second.jsonl')
  await writeFile(secondTranscript, line('other-first', 'other fixture'))
  const second = connect({
    params: {
      agent: 'claude',
      sessionId: 'fixture-other',
      transcriptPath: secondTranscript,
      subscriptionId: 'fixture-owned'
    }
  })
  await vi.waitFor(() => expect(getActiveNativeChatWatcherCount()).toBe(watcherBaseline + 2))
  first.socket.destroy()
  await vi.waitFor(() => expect(getActiveNativeChatWatcherCount()).toBe(watcherBaseline + 1))
  await appendFile(secondTranscript, line('other-second', 'still watching'))
  await vi.waitFor(() =>
    expect(second.frames).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ok: true,
          result: expect.objectContaining({
            type: 'appended',
            messages: expect.arrayContaining([expect.objectContaining({ id: 'other-second' })])
          })
        })
      ])
    )
  )
})
it('refuses invalid authentication before registering a transcript watcher', async () => {
  const { frames } = connect({ authToken: 'fixture-invalid' })
  await vi.waitFor(() =>
    expect(frames).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ok: false,
          error: expect.objectContaining({ code: 'unauthorized' })
        })
      ])
    )
  )
  expect(getActiveNativeChatWatcherCount()).toBe(watcherBaseline)
})
it('keeps the unary streaming-method refusal for clients without the opt-in', async () => {
  const { frames } = connect({ localStream: undefined })
  await vi.waitFor(() =>
    expect(frames).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ok: false,
          error: expect.objectContaining({ code: 'method_not_supported' })
        })
      ])
    )
  )
  expect(getActiveNativeChatWatcherCount()).toBe(watcherBaseline)
})
it('refuses malformed native chat params without registering a watcher', async () => {
  const { frames } = connect({ params: { agent: 'claude', sessionId: '' } })
  await vi.waitFor(() =>
    expect(frames).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ok: false,
          error: expect.objectContaining({ code: 'invalid_argument' })
        })
      ])
    )
  )
  expect(getActiveNativeChatWatcherCount()).toBe(watcherBaseline)
})

it('refuses another stream on the same connection without cancelling its owner', async () => {
  const { socket, frames } = connect()
  await vi.waitFor(() => expect(getActiveNativeChatWatcherCount()).toBe(watcherBaseline + 1))
  socket.write(
    `${JSON.stringify({
      id: 'fixture-second-stream',
      authToken: readMetadata(root).authToken,
      method: 'nativeChat.subscribe',
      localStream: 1,
      params: { agent: 'claude', sessionId: 'fixture', transcriptPath: transcript }
    })}\n`
  )
  await vi.waitFor(() =>
    expect(frames).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'fixture-second-stream',
          ok: false,
          error: expect.objectContaining({ code: 'runtime_busy' })
        })
      ])
    )
  )
  await appendFile(transcript, line('fixture-after-refusal', 'owner still watching'))
  await vi.waitFor(() =>
    expect(frames).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'fixture-watch',
          ok: true,
          result: expect.objectContaining({
            type: 'appended',
            messages: expect.arrayContaining([
              expect.objectContaining({ id: 'fixture-after-refusal' })
            ])
          })
        })
      ])
    )
  )
})
it('never routes the opt-in to an arbitrary unary mutation', async () => {
  await server.stop()
  const effect = vi.fn()
  server = new OrcaRuntimeRpcServer({
    runtime: new OrcaRuntimeService(),
    userDataPath: root,
    enableWebSocket: false,
    methods: [
      defineMethod({
        name: 'fixture.effect',
        params: z.object({}).strict(),
        handler: () => {
          effect()
          return { applied: true }
        }
      })
    ]
  })
  await server.start()
  const { frames } = connect({ method: 'fixture.effect', params: {} })
  await vi.waitFor(() =>
    expect(frames).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ok: false,
          error: expect.objectContaining({ code: 'method_not_supported' })
        })
      ])
    )
  )
  expect(effect).not.toHaveBeenCalled()
})
it('aborts the stream when an outbound frame exceeds the existing JSON budget', async () => {
  await server.stop()
  const aborted = vi.fn()
  server = new OrcaRuntimeRpcServer({
    runtime: new OrcaRuntimeService(),
    userDataPath: root,
    enableWebSocket: false,
    methods: [
      defineStreamingMethod({
        name: 'nativeChat.subscribe',
        params: z.object({}).strip(),
        handler: (_params, { signal }, emit) => {
          signal?.addEventListener('abort', aborted, { once: true })
          emit({ type: 'snapshot', data: 'x'.repeat(REMOTE_RUNTIME_MAX_OUTBOUND_JSON_BYTES) })
        }
      })
    ]
  })
  await server.start()
  const { socket } = connect()
  await vi.waitFor(() => expect(socket.destroyed).toBe(true))
  await vi.waitFor(() => expect(aborted).toHaveBeenCalledOnce())
})
