import { EventEmitter } from 'node:events'
import type { BrowserWindow } from 'electron'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectFilterParams } from '../../shared/rpc-contract/project-filter-params'

const ipc = vi.hoisted(() => ({ on: vi.fn(), removeListener: vi.fn() }))
vi.mock('electron', () => ({ ipcMain: ipc }))
import { requestProjectFilterFromRenderer } from './project-filter-request-relay'

const events = new EventEmitter()
ipc.on.mockImplementation((name, listener) => events.on(name, listener))
ipc.removeListener.mockImplementation((name, listener) => events.removeListener(name, listener))
afterEach(() => {
  events.removeAllListeners()
  vi.useRealTimers()
})
function target() {
  const contents = Object.assign(new EventEmitter(), { isDestroyed: () => false, send: vi.fn() })
  const window = Object.assign(new EventEmitter(), {
    id: 42,
    isDestroyed: () => false,
    webContents: contents
  })
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: The relay only uses the lifecycle and IPC members supplied by this test double.
  return { window: window as unknown as BrowserWindow, contents }
}
const command = ProjectFilterParams.parse({ viewer: 'host', operation: 'get' })

describe('project filter renderer ownership', () => {
  it('ignores foreign senders and request IDs, validates responses, and supplies the real viewer ID', async () => {
    const { window, contents } = target()
    const pending = requestProjectFilterFromRenderer(window, command)
    const sent = contents.send.mock.calls[0][1]
    events.emit(
      'ui:projectFilterResponse',
      { sender: {} },
      { id: sent.id, ok: false, error: 'foreign' }
    )
    events.emit(
      'ui:projectFilterResponse',
      { sender: contents },
      { id: 'wrong', ok: false, error: 'wrong_id' }
    )
    events.emit(
      'ui:projectFilterResponse',
      { sender: contents },
      {
        id: sent.id,
        ok: true,
        result: {
          viewer: 'host',
          viewerId: 999,
          repoIds: [],
          persisted: true,
          applied: false,
          visibleWorktreeIds: null,
          visibleFolderWorkspaceIds: null
        }
      }
    )
    await expect(pending).resolves.toMatchObject({ viewerId: 42, persisted: true, applied: false })
    expect(events.listenerCount('ui:projectFilterResponse')).toBe(0)
    expect(contents.listenerCount('did-start-loading')).toBe(0)
  })
  it('cleans up on navigation and refuses malformed responses', async () => {
    const { window, contents } = target()
    const pending = requestProjectFilterFromRenderer(window, command)
    contents.emit('did-start-loading')
    await expect(pending).rejects.toThrow('renderer_unavailable')
    const invalid = requestProjectFilterFromRenderer(window, command)
    events.emit(
      'ui:projectFilterResponse',
      { sender: contents },
      { id: contents.send.mock.calls[1][1].id, ok: true, result: {} }
    )
    await expect(invalid).rejects.toThrow('invalid_renderer_response')
    expect(events.listenerCount('ui:projectFilterResponse')).toBe(0)
  })
  it('does not label a timed-out write as failed persistence', async () => {
    vi.useFakeTimers()
    const { window } = target()
    const pending = requestProjectFilterFromRenderer(window, command)
    const assertion = expect(pending).rejects.toThrow('renderer_timeout_persistence_unknown')
    await vi.advanceTimersByTimeAsync(10000)
    await assertion
    expect(events.listenerCount('ui:projectFilterResponse')).toBe(0)
  })
})
