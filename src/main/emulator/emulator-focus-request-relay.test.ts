import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    ipcMain: new EventEmitter(),
    BrowserWindow: class extends EventEmitter {
      id = 7
      isDestroyed = () => false
      webContents = Object.assign(new EventEmitter(), { isDestroyed: () => false, send: vi.fn() })
    }
  }
})
import { BrowserWindow, ipcMain } from 'electron'
import { requestEmulatorFocus } from './emulator-focus-request-relay'
afterEach(() => {
  ipcMain.removeAllListeners()
  vi.useRealTimers()
})
function requestId(window: BrowserWindow): string {
  const value: unknown = vi.mocked(window.webContents.send).mock.calls[0]?.[1]
  if (!value || typeof value !== 'object' || !('id' in value) || typeof value.id !== 'string') {
    throw new Error('Missing request')
  }
  return value.id
}
describe('emulator viewer focus acknowledgement', () => {
  it('uses a separate frame channel and rejects old-viewer focus-only acknowledgements', async () => {
    const window = new BrowserWindow()
    const pending = requestEmulatorFocus(window, 'folder-mobile', undefined, {
      tabId: 'sim-tab',
      action: { type: 'wheel', clientX: 50, clientY: 100, deltaX: 0, deltaY: 10, deltaMode: 0 }
    })
    expect(window.webContents.send).toHaveBeenCalledWith('emulator:frameRequest', expect.anything())
    ipcMain.emit(
      'emulator:focusResponse',
      { sender: window.webContents },
      {
        id: requestId(window),
        ok: true,
        result: {
          viewer: 'host',
          viewerId: 7,
          worktreeId: 'folder-mobile',
          tabId: 'sim-tab',
          groupId: 'group',
          applied: true
        }
      }
    )
    await expect(pending).rejects.toThrow('invalid_renderer_response')
  })
  it('requires exact requested tab identity in the read-back', async () => {
    const window = new BrowserWindow()
    const pending = requestEmulatorFocus(window, 'folder-mobile', undefined, {
      tabId: 'sim-tab',
      action: { type: 'wheel', clientX: 50, clientY: 100, deltaX: 0, deltaY: 10, deltaMode: 0 }
    })
    ipcMain.emit(
      'emulator:focusResponse',
      { sender: window.webContents },
      {
        id: requestId(window),
        ok: true,
        result: {
          viewer: 'host',
          viewerId: 7,
          worktreeId: 'folder-mobile',
          tabId: 'wrong-tab',
          groupId: 'group',
          applied: true,
          frameState: { streamError: false, streamSize: { width: 200, height: 100 } }
        }
      }
    )
    await expect(pending).rejects.toThrow('invalid_renderer_response')
  })
  it('times out an old viewer without sending a focus request', async () => {
    vi.useFakeTimers()
    const window = new BrowserWindow()
    const pending = requestEmulatorFocus(window, 'folder-mobile', undefined, {
      tabId: 'sim-tab',
      action: { type: 'wheel', clientX: 50, clientY: 100, deltaX: 0, deltaY: 10, deltaMode: 0 }
    })
    const rejected = expect(pending).rejects.toThrow('viewer_focus_timeout_applied_unknown')
    await vi.advanceTimersByTimeAsync(10000)
    await rejected
    expect(vi.mocked(window.webContents.send).mock.calls.map((call) => call[0])).toEqual([
      'emulator:frameRequest'
    ])
  })
  it('accepts only the authoritative viewer response and scopes it to the workspace', async () => {
    const window = new BrowserWindow()
    const pending = requestEmulatorFocus(window, 'folder-mobile')
    const id = requestId(window)
    const response = {
      id,
      ok: true,
      result: {
        viewer: 'host',
        viewerId: 999,
        worktreeId: 'folder-mobile',
        tabId: 'sim-tab',
        groupId: 'group',
        applied: true
      }
    }
    ipcMain.emit('emulator:focusResponse', { sender: new EventEmitter() }, response)
    expect(ipcMain.listenerCount('emulator:focusResponse')).toBe(1)
    ipcMain.emit('emulator:focusResponse', { sender: window.webContents }, response)
    await expect(pending).resolves.toMatchObject({ viewerId: 7, applied: true })
    expect(ipcMain.listenerCount('emulator:focusResponse')).toBe(0)
  })
  it('rejects viewer destruction and removes response listeners', async () => {
    const window = new BrowserWindow()
    const pending = requestEmulatorFocus(window, 'folder-mobile')
    window.webContents.emit('did-start-loading')
    await expect(pending).rejects.toThrow('renderer_unavailable')
    expect(ipcMain.listenerCount('emulator:focusResponse')).toBe(0)
  })
  it('reports timeout as unknown rather than applied success', async () => {
    vi.useFakeTimers()
    const window = new BrowserWindow()
    const pending = requestEmulatorFocus(window, 'folder-mobile')
    const rejected = expect(pending).rejects.toThrow('viewer_focus_timeout_applied_unknown')
    await vi.advanceTimersByTimeAsync(10000)
    await rejected
    expect(ipcMain.listenerCount('emulator:focusResponse')).toBe(0)
  })
  it('releases pending acknowledgement listeners when the caller disconnects', async () => {
    const window = new BrowserWindow()
    const controller = new AbortController()
    const pending = requestEmulatorFocus(window, 'folder-mobile', controller.signal)
    controller.abort()
    await expect(pending).rejects.toThrow('viewer_focus_cancelled_applied_unknown')
    expect(ipcMain.listenerCount('emulator:focusResponse')).toBe(0)
  })

  it('rejects a different workspace result', async () => {
    const window = new BrowserWindow()
    const pending = requestEmulatorFocus(window, 'folder-mobile')
    ipcMain.emit(
      'emulator:focusResponse',
      { sender: window.webContents },
      {
        id: requestId(window),
        ok: true,
        result: {
          viewer: 'host',
          viewerId: 7,
          worktreeId: 'wrong',
          tabId: 'sim',
          groupId: 'group',
          applied: true
        }
      }
    )
    await expect(pending).rejects.toThrow('invalid_renderer_response')
  })
})
