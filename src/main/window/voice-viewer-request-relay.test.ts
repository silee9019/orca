import { EventEmitter } from 'node:events'
import type { BrowserWindow } from 'electron'
import { afterEach, describe, expect, it, vi } from 'vitest'

const ipc = vi.hoisted((): { emitter?: EventEmitter } => ({}))
vi.mock('electron', () => ({ ipcMain: {
  on: (channel: string, callback: (...args: unknown[]) => void) => ipc.emitter?.on(channel, callback),
  removeListener: (channel: string, callback: (...args: unknown[]) => void) => ipc.emitter?.removeListener(channel, callback)
} }))
import { requestVoiceViewerFromRenderer } from './voice-viewer-request-relay'
afterEach(() => vi.useRealTimers())
function fixture() {
  ipc.emitter = new EventEmitter()
  const send = vi.fn<(channel: string, request: { id: string }) => void>()
  const contents = Object.assign(new EventEmitter(), { isDestroyed: () => false, send })
  const window = Object.assign(new EventEmitter(), { id: 7, isDestroyed: () => false, webContents: contents })
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: The fixture implements every BrowserWindow member read by the relay.
  const pending = requestVoiceViewerFromRenderer(window as unknown as BrowserWindow, { viewer: 'host', operation: 'microphones-list' })
  const id = send.mock.calls[0]?.[1].id
  if (!id) {throw new Error('Missing request')}
  return { pending, contents, window, id }
}
describe('voice viewer relay', () => {
  it('accepts only the correlated host renderer and uses the main process viewer ID', async () => {
    const value = fixture()
    const response = { id: value.id, ok: true, result: { viewer: 'host', viewerId: 999, applied: true, persisted: true, devices: [] } }
    ipc.emitter?.emit('ui:voiceViewerResponse', { sender: {} }, response)
    ipc.emitter?.emit('ui:voiceViewerResponse', { sender: value.contents }, { ...response, id: 'wrong' })
    expect(ipc.emitter?.listenerCount('ui:voiceViewerResponse')).toBe(1)
    ipc.emitter?.emit('ui:voiceViewerResponse', { sender: value.contents }, response)
    await expect(value.pending).resolves.toMatchObject({ viewerId: 7 })
    expect(ipc.emitter?.listenerCount('ui:voiceViewerResponse')).toBe(0)
  })
  it('rejects a renderer reload and removes pending listeners', async () => {
    const value = fixture()
    value.contents.emit('did-start-loading')
    await expect(value.pending).rejects.toThrow('renderer_unavailable')
    expect(ipc.emitter?.listenerCount('ui:voiceViewerResponse')).toBe(0)
  })
  it('reports unknown persistence when an old viewer does not acknowledge', async () => {
    vi.useFakeTimers()
    const value = fixture()
    const rejection = expect(value.pending).rejects.toThrow('renderer_timeout_persistence_unknown')
    await vi.advanceTimersByTimeAsync(10000)
    await rejection
    expect(ipc.emitter?.listenerCount('ui:voiceViewerResponse')).toBe(0)
  })
})
