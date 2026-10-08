// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { useEffect } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { RemoteStep } from './AddRepoRemoteStep'
import { useRemoteRepo } from './AddRepoSteps'
import { Dialog } from '@/components/ui/dialog'
import { useAppStore } from '@/store'
import { applySshConfirmationViewerRequest } from '@/runtime/ssh-confirmation-viewer-controller'
import { resetSshConnectInFlightForTests } from '@/ssh/ssh-connect-in-flight'
import type { SshConnectionState } from '../../../../shared/ssh-types'
import type { ConnectionsViewerCommand } from '../../../../shared/rpc-contract/connections-viewer-params'
const target = {
  id: 'host-a',
  label: 'Host A',
  host: 'private-host-canary',
  username: 'fixture',
  port: 22
}
const list = vi.fn(),
  get = vi.fn()
const connect = vi.fn(),
  listener = vi.fn()
let publish: ((value: { targetId: string; state: SshConnectionState }) => void) | undefined
function state(status: 'connected' | 'disconnected'): SshConnectionState {
  return { targetId: target.id, status, error: null, reconnectAttempt: 0 }
}
const fetch = async () => {},
  close = () => {},
  step = () => {}
function Surface() {
  const owner = useRemoteRepo(fetch, step, close)
  const { handleOpenRemoteStep } = owner
  useEffect(() => {
    void handleOpenRemoteStep()
  }, [handleOpenRemoteStep])
  return (
    <Dialog open>
      <RemoteStep
        sshTargets={owner.sshTargets}
        selectedTargetId={owner.selectedTargetId}
        remotePath={owner.remotePath}
        remoteError={owner.remoteError}
        isAddingRemote={owner.isAddingRemote}
        onSelectTarget={owner.setSelectedTargetId}
        onRemotePathChange={owner.setRemotePath}
        onAdd={() => {}}
        onOpenSshSettings={() => {}}
        onConnectTarget={owner.handleConnectTarget}
      />
    </Dialog>
  )
}
async function invoke(command: ConnectionsViewerCommand) {
  let pending: ReturnType<typeof applySshConfirmationViewerRequest> | undefined
  await act(async () => {
    pending = applySshConfirmationViewerRequest({
      id: 'row-fixture',
      expiresAt: Date.now() + 500,
      command
    })
    void pending.catch(() => {})
  })
  if (!pending) {
    throw new Error('fixture_missing')
  }
  return pending
}
const scope = {
  viewerId: 7,
  surface: 'target-row' as const,
  targetId: target.id,
  expectedHostId: 'ssh:host-a'
}
beforeEach(() => {
  vi.clearAllMocks()
  resetSshConnectInFlightForTests()
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.getState().setSshTargetsMetadata([target])
  publish = undefined
  list.mockResolvedValue([target])
  get.mockResolvedValue(state('disconnected'))
  connect.mockImplementation(async () => {
    useAppStore.getState().setSshConnectionState(target.id, state('connected'))
    publish?.({ targetId: target.id, state: state('connected') })
    return state('connected')
  })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      ssh: {
        listTargets: list,
        getState: get,
        connect,
        onStateChanged: (callback: typeof publish) => {
          publish = callback
          listener()
          return () => {
            publish = undefined
          }
        }
      }
    }
  })
})
afterEach(() => {
  cleanup()
  resetSshConnectInFlightForTests()
  useAppStore.setState(useAppStore.getInitialState(), true)
})
it('connects through the real RemoteStep/useRemoteRepo owner and selects through native Enter/Space and typed selection', async () => {
  const other = { ...target, id: 'host-b', label: 'Host B' }
  list.mockResolvedValue([target, other])
  get.mockImplementation(async ({ targetId }: { targetId: string }) =>
    targetId === 'host-b' ? { ...state('connected'), targetId: 'host-b' } : state('disconnected')
  )
  useAppStore.getState().setSshTargetsMetadata([target, other])
  useAppStore
    .getState()
    .setSshConnectionState('host-b', { ...state('connected'), targetId: 'host-b' })

  render(<Surface />)
  const button = await screen.findByRole('button', { name: 'Connect' })
  fireEvent.click(button)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Host A' })).toBeVisible())
  expect(connect).toHaveBeenCalledExactlyOnceWith({ targetId: target.id })
  await expect(invoke({ ...scope, operation: 'ssh-workspace.host-select' })).resolves.toMatchObject(
    { applied: true, state: { workspaceForget: { selected: true } } }
  )
  const row = screen.getByRole('button', { name: 'Host A' })
  fireEvent.click(screen.getByRole('button', { name: 'Host B' }))
  expect(row).not.toHaveClass('border-foreground/30')
  const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
  fireEvent(row, enter)
  expect(enter.defaultPrevented).toBe(true)
  expect(row).toHaveClass('border-foreground/30')
  fireEvent.click(screen.getByRole('button', { name: 'Host B' }))
  expect(row).not.toHaveClass('border-foreground/30')
  const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
  fireEvent(row, space)
  expect(space.defaultPrevented).toBe(true)
  expect(row).toHaveClass('border-foreground/30')
})
it('shares typed connect with native owner and rejects stale metadata before native selection/connect', async () => {
  render(<Surface />)
  await screen.findByRole('button', { name: 'Connect' })
  await expect(
    invoke({ ...scope, operation: 'ssh-workspace.host-connect' })
  ).resolves.toMatchObject({ applied: true })
  const row = screen.getByRole('button', { name: 'Host A' })
  await act(async () => {
    useAppStore.getState().setSshTargetsMetadata([])
    fireEvent.click(row)
  })
  await expect(invoke({ ...scope, operation: 'ssh-workspace.host-select' })).rejects.toThrow(
    'ssh_host_action_unavailable'
  )
  expect(connect).toHaveBeenCalledOnce()
})
it('does not ACK swallowed connection failures or select disconnected rows', async () => {
  connect.mockResolvedValueOnce(undefined)
  render(<Surface />)
  await screen.findByRole('button', { name: 'Connect' })
  await expect(invoke({ ...scope, operation: 'ssh-workspace.host-select' })).rejects.toThrow(
    'ssh_host_action_unavailable'
  )
  await expect(invoke({ ...scope, operation: 'ssh-workspace.host-connect' })).rejects.toThrow(
    'request_expired'
  )
  expect(connect).toHaveBeenCalledOnce()
})
it.each(['Enter', ' '])(
  'keeps native %s selection on the current host when painted metadata has been removed',
  async (key) => {
    const other = { ...target, id: 'host-b', label: 'Host B' }
    list.mockResolvedValue([target, other])
    get.mockImplementation(async ({ targetId }: { targetId: string }) => ({
      ...state('connected'),
      targetId
    }))
    useAppStore.getState().setSshTargetsMetadata([target, other])
    useAppStore.getState().setSshConnectionState(target.id, state('connected'))
    useAppStore
      .getState()
      .setSshConnectionState(other.id, { ...state('connected'), targetId: other.id })
    render(<Surface />)
    const row = await screen.findByRole('button', { name: 'Host A' })
    fireEvent.click(screen.getByRole('button', { name: 'Host B' }))
    expect(row).not.toHaveClass('border-foreground/30')
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    await act(async () => {
      useAppStore.getState().setSshTargetsMetadata([])
      fireEvent(row, event)
    })
    expect(event.defaultPrevented).toBe(true)
    expect(row).not.toHaveClass('border-foreground/30')
    expect(screen.getByRole('button', { name: 'Host B' })).toHaveClass('border-foreground/30')
    expect(connect).not.toHaveBeenCalled()
  }
)
