import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultWorkspaceFilters } from '../../shared/workspace-filter-command'

const ipc = vi.hoisted(() => ({ on: vi.fn(), removeListener: vi.fn() }))
vi.mock('electron', () => ({ ipcMain: ipc }))
import { requestWorkspaceFilterFromRenderer } from './workspace-filter-request-relay'

const events = new EventEmitter()
ipc.on.mockImplementation((name, listener) => events.on(name, listener))
ipc.removeListener.mockImplementation((name, listener) => events.removeListener(name, listener))
afterEach(() => {
  events.removeAllListeners()
  vi.useRealTimers()
})

function target() {
  const contents = Object.assign(new EventEmitter(), {
    isDestroyed: (): boolean => false,
    send: vi.fn()
  })
  const window = Object.assign(new EventEmitter(), {
    id: 42,
    isDestroyed: (): boolean => false,
    webContents: contents
  })
  return { window, contents }
}

describe('workspace filter renderer ownership', () => {
  it('ignores other senders and request IDs and stamps the actual window ID', async () => {
    const { window, contents } = target()
    const result = requestWorkspaceFilterFromRenderer(window, { viewer: 'host', operation: 'get' })
    const sent = contents.send.mock.calls[0][1]
    events.emit(
      'ui:workspaceFilterResponse',
      { sender: {} },
      { id: sent.id, ok: false, error: 'foreign' }
    )
    events.emit(
      'ui:workspaceFilterResponse',
      { sender: contents },
      { id: 'wrong', ok: false, error: 'wrong' }
    )
    events.emit(
      'ui:workspaceFilterResponse',
      { sender: contents },
      {
        id: sent.id,
        ok: true,
        result: {
          viewer: 'host',
          viewerId: 999,
          filters: defaultWorkspaceFilters(),
          persisted: true,
          applied: false,
          visibleWorktreeIds: null,
          visibleFolderWorkspaceIds: null
        }
      }
    )
    expect(await result).toMatchObject({ viewerId: 42, persisted: true, applied: false })
    expect(events.listenerCount('ui:workspaceFilterResponse')).toBe(0)
    expect(contents.listenerCount('did-start-loading')).toBe(0)
  })
  it('rejects navigation and malformed replies with all listeners removed', async () => {
    const { window, contents } = target()
    const pending = requestWorkspaceFilterFromRenderer(window, {
      viewer: 'host',
      operation: 'reset'
    })
    contents.emit('did-start-loading')
    await expect(pending).rejects.toThrow('renderer_unavailable')
    const invalid = requestWorkspaceFilterFromRenderer(window, { viewer: 'host', operation: 'get' })
    events.emit(
      'ui:workspaceFilterResponse',
      { sender: contents },
      { id: contents.send.mock.calls[1][1].id, ok: true, result: {} }
    )
    await expect(invalid).rejects.toThrow('invalid_renderer_response')
    expect(events.listenerCount('ui:workspaceFilterResponse')).toBe(0)
  })
  it('keeps persistence unknown on timeout and refuses destroyed windows before sending', async () => {
    vi.useFakeTimers()
    const { window, contents } = target()
    const pending = requestWorkspaceFilterFromRenderer(window, {
      viewer: 'host',
      operation: 'reset'
    })
    const assertion = expect(pending).rejects.toThrow('renderer_timeout_persistence_unknown')
    await vi.advanceTimersByTimeAsync(10000)
    await assertion
    expect(events.listenerCount('ui:workspaceFilterResponse')).toBe(0)
    window.isDestroyed = () => true
    await expect(
      requestWorkspaceFilterFromRenderer(window, { viewer: 'host', operation: 'reset' })
    ).rejects.toThrow('renderer_unavailable')
    expect(contents.send).toHaveBeenCalledTimes(1)
  })
})
