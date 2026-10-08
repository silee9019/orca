import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocketServer } from 'ws'
import { sendEmulatorControlSequence } from './emulator-control-sequence'
import { EmulatorControlParams } from '../../shared/rpc-contract/emulator-control-params'

const servers: WebSocketServer[] = []
afterEach(async () => {
  vi.useRealTimers()
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          for (const socket of server.clients) {
            socket.terminate()
          }
          server.close(() => resolve())
        })
    )
  )
})
async function fixture() {
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1' })
  servers.push(server)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const address = server.address()
  if (typeof address === 'string' || !address) {
    throw new Error('Missing fixture port')
  }
  const frames: unknown[] = []
  server.on('connection', (socket) =>
    socket.on('message', (bytes) => {
      const data = Buffer.concat(
        Array.isArray(bytes) ? bytes : [bytes instanceof ArrayBuffer ? Buffer.from(bytes) : bytes]
      )
      frames.push({ tag: data[0], frame: JSON.parse(data.subarray(1).toString()) })
    })
  )
  return { url: `ws://127.0.0.1:${address.port}`, frames, server }
}
describe('emulator control lifecycle', () => {
  it('uses renderer keyboard frames and releases held touch on blur', async () => {
    const { url, frames } = await fixture()
    await sendEmulatorControlSequence(
      url,
      [
        { type: 'key', key: 'ArrowLeft', shift: true },
        { type: 'touch', phase: 'begin', x: 0.2, y: 0.3 },
        { type: 'wait', ms: 25 },
        { type: 'touch', phase: 'move', x: 0.4, y: 0.6 },
        { type: 'blur' }
      ],
      new AbortController().signal
    )
    expect(frames).toEqual([
      { tag: 6, frame: { type: 'down', usage: 225 } },
      { tag: 6, frame: { type: 'down', usage: 80 } },
      { tag: 6, frame: { type: 'up', usage: 80 } },
      { tag: 6, frame: { type: 'up', usage: 225 } },
      { tag: 3, frame: { type: 'begin', x: 0.2, y: 0.3 } },
      { tag: 3, frame: { type: 'move', x: 0.4, y: 0.6 } },
      { tag: 3, frame: { type: 'end', x: 0.4, y: 0.6 } }
    ])
  })
  it('releases held touch when the caller cancels a wait', async () => {
    const { url, frames } = await fixture()
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 60)
    await sendEmulatorControlSequence(
      url,
      [
        { type: 'touch', phase: 'begin', x: 0.5, y: 0.5 },
        { type: 'wait', ms: 1000 }
      ],
      controller.signal
    )
    expect(frames).toEqual([
      { tag: 3, frame: { type: 'begin', x: 0.5, y: 0.5 } },
      { tag: 3, frame: { type: 'end', x: 0.5, y: 0.5 } }
    ])
  })
  it('releases a held modifier if cancellation interrupts a shifted key', async () => {
    const { url, frames, server } = await fixture()
    const controller = new AbortController()
    server.on('connection', (socket) => socket.once('message', () => controller.abort()))
    await sendEmulatorControlSequence(
      url,
      [{ type: 'key', key: 'A', shift: true }],
      controller.signal
    )
    expect(frames).toEqual([
      { tag: 6, frame: { type: 'down', usage: 225 } },
      { tag: 6, frame: { type: 'up', usage: 225 } }
    ])
  })

  it('requests held-touch release before rejecting the connection deadline', async () => {
    const { url, frames, server } = await fixture()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const firstFrame = new Promise<void>((resolve) =>
      server.on('connection', (socket) => socket.once('message', () => resolve()))
    )
    const pending = sendEmulatorControlSequence(
      url,
      [
        { type: 'touch', phase: 'begin', x: 0.5, y: 0.5 },
        { type: 'wait', ms: 1000000 }
      ],
      new AbortController().signal
    )
    const rejected = expect(pending).rejects.toThrow('timed out')
    await firstFrame
    await vi.advanceTimersByTimeAsync(65000)
    await rejected
    expect(frames).toEqual([
      { tag: 3, frame: { type: 'begin', x: 0.5, y: 0.5 } },
      { tag: 3, frame: { type: 'end', x: 0.5, y: 0.5 } }
    ])
  })

  it('reports held-input release as unverified after transport loss', async () => {
    const { url, server } = await fixture()
    server.on('connection', (socket) => socket.once('message', () => socket.terminate()))
    await expect(
      sendEmulatorControlSequence(
        url,
        [
          { type: 'touch', phase: 'begin', x: 0.5, y: 0.5 },
          { type: 'wait', ms: 1000 }
        ],
        new AbortController().signal
      )
    ).rejects.toThrow('held input release could not be verified')
  })

  it('rejects unsupported keys before connecting and limits duration and untrusted fields', async () => {
    await expect(
      sendEmulatorControlSequence(
        'ws://127.0.0.1:1',
        [{ type: 'key', key: 'unsupported' }],
        new AbortController().signal
      )
    ).rejects.toMatchObject({ code: 'emulator_unsupported' })
    expect(
      EmulatorControlParams.safeParse({
        worktree: 'folder:x',
        events: [
          { type: 'wait', ms: 60000 },
          { type: 'wait', ms: 1 }
        ]
      }).success
    ).toBe(false)
    expect(
      EmulatorControlParams.safeParse({
        worktree: 'folder:x',
        wsUrl: 'ws://untrusted',
        events: [{ type: 'blur' }]
      }).success
    ).toBe(false)
  })
})
