import { EventEmitter } from 'node:events'
import type { BrowserWindow } from 'electron'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConnectionsViewerParams } from '../../shared/rpc-contract/connections-viewer-params'

const ipc = vi.hoisted(() => ({ on: vi.fn(), removeListener: vi.fn() }))
vi.mock('electron', () => ({ ipcMain: ipc }))
import { requestConnectionsViewerFromRenderer } from './connections-viewer-request-relay'

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
const command = ConnectionsViewerParams.parse({ viewerId: 42, operation: 'runtime.get' })

it('binds status bar responses to the exact result family', async () => {
  const { window, contents } = target()
  const statusCommand = ConnectionsViewerParams.parse({
    viewerId: 42,
    operation: 'status-bar.disclosure',
    open: true
  })
  const rejected = requestConnectionsViewerFromRenderer(window, statusCommand)
  events.emit(
    'ui:connectionsViewerResponse',
    { sender: contents },
    {
      id: contents.send.mock.calls[0][1].id,
      ok: true,
      result: {
        viewerId: 42,
        applied: true,
        persisted: null,
        state: { activeView: 'skills', sharedViewApplied: true }
      }
    }
  )
  await expect(rejected).rejects.toThrow('invalid_renderer_response')
  const accepted = requestConnectionsViewerFromRenderer(window, statusCommand)
  events.emit(
    'ui:connectionsViewerResponse',
    { sender: contents },
    {
      id: contents.send.mock.calls[1][1].id,
      ok: true,
      result: { viewerId: 42, applied: true, persisted: null, state: { statusBar: { open: true } } }
    }
  )
  await expect(accepted).resolves.toMatchObject({ state: { statusBar: { open: true } } })
  expect(events.listenerCount('ui:connectionsViewerResponse')).toBe(0)
})

describe('connections viewer renderer ownership', () => {
  it('ignores foreign senders and request IDs, validates responses, and supplies the real viewer ID', async () => {
    const { window, contents } = target()
    const pending = requestConnectionsViewerFromRenderer(window, command)
    const sent = contents.send.mock.calls[0][1]
    events.emit(
      'ui:connectionsViewerResponse',
      { sender: {} },
      { id: sent.id, ok: false, error: 'foreign' }
    )
    events.emit(
      'ui:connectionsViewerResponse',
      { sender: contents },
      { id: 'wrong', ok: false, error: 'wrong_id' }
    )
    events.emit(
      'ui:connectionsViewerResponse',
      { sender: contents },
      {
        id: sent.id,
        ok: true,
        result: {
          viewerId: 42,
          persisted: true,
          applied: false,
          state: {
            environmentId: null,
            workflow: 'connect',
            addFormOpen: false,
            shareFormOpen: true,
            advancedOpen: false,
            name: '',
            pairingCodeSet: false
          }
        }
      }
    )
    await expect(pending).resolves.toMatchObject({ viewerId: 42, persisted: true, applied: false })
    expect(events.listenerCount('ui:connectionsViewerResponse')).toBe(0)
    expect(contents.listenerCount('did-start-loading')).toBe(0)
  })
  it('cleans up on navigation and refuses malformed responses', async () => {
    const { window, contents } = target()
    const pending = requestConnectionsViewerFromRenderer(window, command)
    contents.emit('did-start-loading')
    await expect(pending).rejects.toThrow('renderer_unavailable')
    const invalid = requestConnectionsViewerFromRenderer(window, command)
    events.emit(
      'ui:connectionsViewerResponse',
      { sender: contents },
      { id: contents.send.mock.calls[1][1].id, ok: true, result: {} }
    )
    await expect(invalid).rejects.toThrow('invalid_renderer_response')
    expect(events.listenerCount('ui:connectionsViewerResponse')).toBe(0)
  })
  it('does not label a timed-out write as failed persistence', async () => {
    vi.useFakeTimers()
    const { window } = target()
    const pending = requestConnectionsViewerFromRenderer(window, command)
    const assertion = expect(pending).rejects.toThrow('renderer_timeout_persistence_unknown')
    await vi.advanceTimersByTimeAsync(10000)
    await assertion
    expect(events.listenerCount('ui:connectionsViewerResponse')).toBe(0)
  })
})

it('rejects a different explicit viewer without sending IPC', async () => {
  const { window, contents } = target()
  await expect(
    requestConnectionsViewerFromRenderer(window, { viewerId: 99, operation: 'runtime.get' })
  ).rejects.toThrow('viewer_target_mismatch')
  expect(contents.send).not.toHaveBeenCalled()
})

it('refuses an otherwise valid response naming a different viewer', async () => {
  const { window, contents } = target()
  const pending = requestConnectionsViewerFromRenderer(window, command)
  events.emit(
    'ui:connectionsViewerResponse',
    { sender: contents },
    {
      id: contents.send.mock.calls[0][1].id,
      ok: true,
      result: {
        viewerId: 999,
        persisted: null,
        applied: true,
        state: {
          environmentId: null,
          workflow: 'connect',
          addFormOpen: false,
          shareFormOpen: true,
          advancedOpen: false,
          name: '',
          pairingCodeSet: false
        }
      }
    }
  )
  await expect(pending).rejects.toThrow('renderer_viewer_mismatch')
})
it('refuses a different domain result for the targeted operation', async () => {
  const { window, contents } = target()
  const pending = requestConnectionsViewerFromRenderer(window, command)
  events.emit(
    'ui:connectionsViewerResponse',
    { sender: contents },
    {
      id: contents.send.mock.calls[0][1].id,
      ok: true,
      result: {
        viewerId: 42,
        persisted: null,
        applied: true,
        state: {
          platform: 'ios',
          iosChannel: 'stable',
          connectionMode: 'local-only',
          selectedAddress: null,
          customAddresses: [],
          stage: 'intro',
          step: 0,
          pairingAvailable: false,
          pairingLoading: false,
          relayFailed: false,
          deviceCount: 0
        }
      }
    }
  )
  await expect(pending).rejects.toThrow('invalid_renderer_response')
})

it('validates the pairing disclosure domain result at the main relay', async () => {
  const { window, contents } = target()
  const pending = requestConnectionsViewerFromRenderer(window, {
    viewerId: 42,
    operation: 'pairing-setup.disclosure',
    open: true
  })
  events.emit(
    'ui:connectionsViewerResponse',
    { sender: contents },
    {
      id: contents.send.mock.calls[0][1].id,
      ok: true,
      result: {
        viewerId: 42,
        applied: true,
        persisted: null,
        state: { open: true, pinned: false, usingRelay: true }
      }
    }
  )
  await expect(pending).resolves.toMatchObject({
    applied: true,
    persisted: null,
    state: { open: true }
  })
  expect(events.listenerCount('ui:connectionsViewerResponse')).toBe(0)
})

it('does not expose a renderer failure string to the CLI caller', async () => {
  const { window, contents } = target()
  const pending = requestConnectionsViewerFromRenderer(window, command)
  events.emit(
    'ui:connectionsViewerResponse',
    { sender: contents },
    {
      id: contents.send.mock.calls[0][1].id,
      ok: false,
      error: 'private-renderer-error-canary'
    }
  )
  await expect(pending).rejects.toMatchObject({ message: 'connections_viewer_request_failed' })
  expect(events.listenerCount('ui:connectionsViewerResponse')).toBe(0)
})

it('accepts the exact SSH confirmation result with the owner unverifiable verdict retained', async () => {
  const { window, contents } = target()
  const pending = requestConnectionsViewerFromRenderer(window, {
    viewerId: 42,
    operation: 'ssh-confirmation.confirm',
    kind: 'terminate',
    confirmTarget: 'host-a'
  })
  events.emit(
    'ui:connectionsViewerResponse',
    { sender: contents },
    {
      id: contents.send.mock.calls[0][1].id,
      ok: true,
      result: {
        viewerId: 42,
        applied: true,
        persisted: null,
        state: { resetTargetId: null, terminateTargetId: null, busy: false },
        termination: { terminated: 0, unverifiable: 2 }
      }
    }
  )
  await expect(pending).resolves.toMatchObject({ termination: { terminated: 0, unverifiable: 2 } })
})

it('accepts the exact shared Skills view result', async () => {
  const { window, contents } = target()
  const pending = requestConnectionsViewerFromRenderer(window, {
    viewerId: 42,
    operation: 'skills.shared-open'
  })
  events.emit(
    'ui:connectionsViewerResponse',
    { sender: contents },
    {
      id: contents.send.mock.calls[0][1].id,
      ok: true,
      result: {
        viewerId: 42,
        applied: true,
        persisted: null,
        state: { activeView: 'skills', sharedViewApplied: true }
      }
    }
  )
  await expect(pending).resolves.toMatchObject({
    applied: true,
    state: { activeView: 'skills', sharedViewApplied: true }
  })
})

it('requires the concrete workspace-removal response for workspace operations', async () => {
  const { window, contents } = target()
  const workspaceCommand = ConnectionsViewerParams.parse({
    viewerId: 42,
    operation: 'ssh-workspace.get',
    workspaceId: 'folder-a',
    targetId: 'host-a'
  })
  const legacy = {
    viewerId: 42,
    persisted: null,
    applied: true,
    termination: null,
    state: { resetTargetId: null, terminateTargetId: null, busy: false }
  }
  const rejected = requestConnectionsViewerFromRenderer(window, workspaceCommand)
  events.emit(
    'ui:connectionsViewerResponse',
    { sender: contents },
    { id: contents.send.mock.calls[0][1].id, ok: true, result: legacy }
  )
  await expect(rejected).rejects.toThrow('invalid_renderer_response')
  const accepted = requestConnectionsViewerFromRenderer(window, workspaceCommand)
  events.emit(
    'ui:connectionsViewerResponse',
    { sender: contents },
    {
      id: contents.send.mock.calls[1][1].id,
      ok: true,
      result: {
        ...legacy,
        state: {
          ...legacy.state,
          workspaceForget: {
            workspaceId: 'folder-a',
            targetId: 'host-a',
            dialogOpen: true,
            canReconnect: true,
            busy: false
          }
        }
      }
    }
  )
  await expect(accepted).resolves.toMatchObject({
    applied: true,
    state: { workspaceForget: { workspaceId: 'folder-a', targetId: 'host-a' } }
  })
  expect(events.listenerCount('ui:connectionsViewerResponse')).toBe(0)
})
it('requires the concrete SSH ports result family from the targeted renderer', async () => {
  const { window, contents } = target()
  const pending = requestConnectionsViewerFromRenderer(window, {
    viewerId: 42,
    operation: 'ssh-ports.get',
    targetId: 'host-a'
  })
  events.emit(
    'ui:connectionsViewerResponse',
    { sender: contents },
    {
      id: contents.send.mock.calls[0][1].id,
      ok: true,
      result: {
        viewerId: 42,
        applied: true,
        persisted: null,
        state: {
          formOpen: false,
          editingId: null,
          saving: false,
          advancedOpen: null,
          configured: {
            host: false,
            username: false,
            identityFile: false,
            proxyCommand: false,
            jumpHost: false
          }
        }
      }
    }
  )
  await expect(pending).rejects.toThrow('invalid_renderer_response')
  const valid = requestConnectionsViewerFromRenderer(window, {
    viewerId: 42,
    operation: 'ssh-ports.get',
    targetId: 'host-a'
  })
  events.emit(
    'ui:connectionsViewerResponse',
    { sender: contents },
    {
      id: contents.send.mock.calls[1][1].id,
      ok: true,
      result: {
        viewerId: 42,
        applied: true,
        persisted: null,
        state: {
          connectionId: 'host-a',
          disconnected: false,
          forwardCount: 1,
          detectedCount: 0,
          dialog: 'closed',
          dialogTargetId: null,
          editingForwardId: null
        }
      }
    }
  )
  await expect(valid).resolves.toMatchObject({ applied: true, state: { connectionId: 'host-a' } })
})
