import { EventEmitter } from 'node:events'
import { afterEach, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({ send: vi.fn(), trusted: true }))
const ipc = new EventEmitter()
vi.mock('electron', () => ({
  ipcMain: {
    on: (channel: string, listener: (...args: unknown[]) => void) => ipc.on(channel, listener),
    removeListener: (channel: string, listener: (...args: unknown[]) => void) =>
      ipc.removeListener(channel, listener)
  }
}))
vi.mock('../ipc/ui', () => ({
  getTrustedUIRendererWebContents: () => (fixture.trusted ? fixture : null)
}))
import { requestAccountViewerAction } from './account-viewer-request'
import { ACCOUNT_VIEWER_RESPONSE_CHANNEL } from '../../shared/account-viewer-contract'

afterEach(() => {
  fixture.send.mockReset()
  fixture.trusted = true
  ipc.removeAllListeners()
})
it.each(['artifact', 'automation', 'skills', 'extensions-sidebar'] as const)(
  'requires the selected renderer and matching request id for %s',
  async (domain) => {
    const result = requestAccountViewerAction({
      domain,
      action: { kind: 'get' }
    })
    const payload = fixture.send.mock.calls[0]?.[1]
    expect(payload).toMatchObject({
      viewer: 'desktop',
      command: { domain, action: { kind: 'get' } }
    })
    ipc.emit(
      ACCOUNT_VIEWER_RESPONSE_CHANNEL,
      { sender: {} },
      { requestId: payload.requestId, ok: true, result: 'wrong-sender' }
    )
    expect(ipc.listenerCount(ACCOUNT_VIEWER_RESPONSE_CHANNEL)).toBe(1)
    ipc.emit(
      ACCOUNT_VIEWER_RESPONSE_CHANNEL,
      { sender: fixture },
      { requestId: '00000000-0000-4000-8000-000000000000', ok: true, result: 'wrong-id' }
    )
    expect(ipc.listenerCount(ACCOUNT_VIEWER_RESPONSE_CHANNEL)).toBe(1)
    ipc.emit(
      ACCOUNT_VIEWER_RESPONSE_CHANNEL,
      { sender: fixture },
      { requestId: payload.requestId, ok: true, result: { query: '보고서', committed: true } }
    )
    await expect(result).resolves.toEqual({ query: '보고서', committed: true })
    expect(ipc.listenerCount(ACCOUNT_VIEWER_RESPONSE_CHANNEL)).toBe(0)
  }
)
it('fails closed without a desktop and cleans pending listeners when cancelled', async () => {
  fixture.trusted = false
  await expect(
    requestAccountViewerAction({ domain: 'artifact', action: { kind: 'get' } })
  ).rejects.toThrow('desktop_unavailable')
  fixture.trusted = true
  const abort = new AbortController()
  const result = requestAccountViewerAction(
    { domain: 'artifact', action: { kind: 'get' } },
    abort.signal
  )
  abort.abort()
  await expect(result).rejects.toThrow('request_cancelled')
  expect(ipc.listenerCount(ACCOUNT_VIEWER_RESPONSE_CHANNEL)).toBe(0)
})
