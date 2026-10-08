import { EventEmitter } from 'node:events'
import { expect, it, vi } from 'vitest'
import { requestPtyDataListenerCount } from '../../src/main/window/pty-data-listener-count-request'
import { installPtyDataListenerCountReply } from '../../src/preload/pty-data-listener-count-reply'
import {
  PTY_DATA_LISTENER_COUNT_REQUEST,
  PTY_DATA_LISTENER_COUNT_REPLY,
  PtyDataListenerCountRequest
} from '../../src/shared/pty-data-listener-count'
function fixture() {
  const main = new EventEmitter(),
    preload = new EventEmitter(),
    contents = new EventEmitter()
  const frame = {},
    renderer = Object.assign(contents, {
      id: 421,
      mainFrame: frame,
      isDestroyed: () => false,
      send: vi.fn((channel: string, payload: unknown) => {
        preload.emit(channel, {}, payload)
      })
    })
  const window = { isDestroyed: () => false, webContents: renderer }
  return { main, preload, contents, frame, renderer, window }
}
it('reads actual preload listener count without installing a data listener', async () => {
  const f = fixture()
  f.preload.on('pty:data', () => {})
  f.preload.on('pty:data', () => {})
  const ipc = Object.assign(f.preload, {
    send: (channel: string, payload: unknown) => {
      f.main.emit(channel, { sender: f.renderer, senderFrame: f.frame }, payload)
    }
  })
  const dispose = installPtyDataListenerCountReply(ipc, () => f.preload.listenerCount('pty:data'))
  expect(await requestPtyDataListenerCount(f.window, f.main, 421, 1000)).toBe(2)
  expect(f.preload.listenerCount('pty:data')).toBe(2)
  expect(f.main.listenerCount(PTY_DATA_LISTENER_COUNT_REPLY)).toBe(0)
  expect(f.contents.listenerCount('did-start-navigation')).toBe(0)
  dispose()
  expect(f.preload.listenerCount(PTY_DATA_LISTENER_COUNT_REQUEST)).toBe(0)
})
it.each(['navigation', 'destroyed', 'abort', 'send-failed', 'timeout', 'wrong-owner'])(
  'refuses unavailable or replaced listener-count owners: %s',
  async (mode) => {
    const f = fixture(),
      abort = new AbortController()
    if (mode === 'send-failed') {
      f.renderer.send.mockImplementation(() => {
        throw new Error('fixture')
      })
    }
    const pending = requestPtyDataListenerCount(
      f.window,
      f.main,
      mode === 'wrong-owner' ? 422 : 421,
      10,
      abort.signal
    )
    const assertion = expect(pending).rejects.toThrow(/renderer_listener_count/)
    if (mode === 'navigation') {
      f.contents.emit('did-start-navigation')
    }
    if (mode === 'destroyed') {
      f.contents.emit('destroyed')
    }
    if (mode === 'abort') {
      abort.abort()
    }
    await assertion
    expect(f.main.listenerCount(PTY_DATA_LISTENER_COUNT_REPLY)).toBe(0)
    expect(f.contents.listenerCount('did-start-navigation')).toBe(0)
  }
)
it('ignores foreign senders, subframes and malformed replies', async () => {
  const f = fixture(),
    pending = requestPtyDataListenerCount(f.window, f.main, 421, 1000)
  const request = PtyDataListenerCountRequest.parse(f.renderer.send.mock.calls[0][1])
  f.main.emit(
    PTY_DATA_LISTENER_COUNT_REPLY,
    { sender: {}, senderFrame: f.frame },
    { ...request, count: 99 }
  )
  f.main.emit(
    PTY_DATA_LISTENER_COUNT_REPLY,
    { sender: f.renderer, senderFrame: {} },
    { ...request, count: 99 }
  )
  f.main.emit(
    PTY_DATA_LISTENER_COUNT_REPLY,
    { sender: f.renderer, senderFrame: f.frame },
    { ...request, count: -1 }
  )
  f.main.emit(
    PTY_DATA_LISTENER_COUNT_REPLY,
    { sender: f.renderer, senderFrame: f.frame },
    { ...request, count: 3 }
  )
  expect(await pending).toBe(3)
})
