// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { WorktreeCardSshHostControl } from './WorktreeCardSshHostControl'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import { applySshConfirmationViewerRequest } from '@/runtime/ssh-confirmation-viewer-controller'
import type { ConnectionsViewerCommand } from '../../../../shared/rpc-contract/connections-viewer-params'
import { resetSshConnectInFlightForTests } from '@/ssh/ssh-connect-in-flight'
const owners = vi.hoisted(() => ({
  connect: vi.fn(),
  remote: vi.fn(),
  disconnect: vi.fn(),
  get: vi.fn(),
  feature: vi.fn()
}))
vi.mock('@/runtime/runtime-environment-ssh-state', () => ({
  connectRuntimeEnvironmentSshTarget: owners.remote,
  resyncRuntimeEnvironmentSshTargets: vi.fn()
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), warning: vi.fn() } }))
function state(status: 'connected' | 'disconnected') {
  return { targetId: 'host-a', status, error: null, reconnectAttempt: 0 }
}
function Surface({ id = 'workspace-a', remote = false }: { id?: string; remote?: boolean }) {
  const status = useAppStore((value) =>
    remote
      ? (value.sshStateByEnvironment.get('env-a')?.connectionStates.get('host-a')?.status ?? null)
      : (value.sshConnectionStates.get('host-a')?.status ?? 'disconnected')
  )
  return (
    <TooltipProvider>
      <WorktreeCardSshHostControl
        workspaceId={id}
        targetId="host-a"
        targetLabel="Host A"
        status={status}
        targetRemoved={false}
        sshOwnerEnvironmentId={remote ? 'env-a' : null}
        iconOnly={false}
        onPointerDown={(event) => event.stopPropagation()}
      />
    </TooltipProvider>
  )
}
const scope = {
  viewerId: 7,
  surface: 'worktree-card' as const,
  workspaceId: 'workspace-a',
  targetId: 'host-a',
  expectedHostId: 'ssh:host-a'
}
async function invoke(command: ConnectionsViewerCommand) {
  let pending: ReturnType<typeof applySshConfirmationViewerRequest> | undefined
  await act(async () => {
    pending = applySshConfirmationViewerRequest({
      id: 'status-fixture',
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
beforeEach(() => {
  vi.clearAllMocks()
  resetSshConnectInFlightForTests()
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({ recordFeatureInteraction: owners.feature })
  useAppStore.getState().setSshTargetsMetadata([{ id: 'host-a', label: 'Host A' }])
  owners.connect.mockImplementation(async () => {
    useAppStore.getState().setSshConnectionState('host-a', state('connected'))
    return state('connected')
  })
  owners.disconnect.mockImplementation(async () => {
    useAppStore.getState().setSshConnectionState('host-a', state('disconnected'))
  })
  owners.get.mockResolvedValue(undefined)
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { ssh: { connect: owners.connect, disconnect: owners.disconnect, getState: owners.get } }
  })
})
afterEach(() => {
  cleanup()
  resetSshConnectInFlightForTests()
  useAppStore.setState(useAppStore.getInitialState(), true)
})

it('shares native pointer and typed host connect without activating or focusing the surrounding card', async () => {
  const container = vi.fn(),
    keyboard = vi.fn(),
    pointer = vi.fn()
  const view = render(
    <div onClick={container} onKeyDown={keyboard} onPointerDown={pointer}>
      <Surface />
    </div>
  )
  const button = screen.getByRole('button', { name: 'Connect to SSH host Host A' })
  fireEvent.pointerDown(button)
  fireEvent.keyDown(button, { key: 'Enter' })
  fireEvent.keyDown(button, { key: ' ' })
  fireEvent.click(button)
  await waitFor(() => expect(screen.getByText('Project on SSH host Host A')).toBeVisible())
  expect(container).not.toHaveBeenCalled()
  expect(keyboard).not.toHaveBeenCalled()
  expect(pointer).not.toHaveBeenCalled()
  view.unmount()
  useAppStore.getState().setSshConnectionState('host-a', state('disconnected'))
  render(<Surface />)
  await expect(
    invoke({ ...scope, operation: 'ssh-workspace.host-connect' })
  ).resolves.toMatchObject({ applied: true, state: { workspaceForget: { connected: true } } })
  expect(owners.connect).toHaveBeenCalledTimes(2)
})
it('pins exact workspace/host, rejects ambiguity and removed native targets before provider calls', async () => {
  const view = render(
    <>
      <Surface />
      <Surface id="workspace-b" />
    </>
  )
  await expect(
    invoke({ ...scope, workspaceId: undefined, operation: 'ssh-workspace.host-connect' })
  ).rejects.toThrow('connections_viewer_ambiguous')
  await expect(
    invoke({ ...scope, expectedHostId: 'runtime:env-a', operation: 'ssh-workspace.host-connect' })
  ).rejects.toThrow('connections_surface_unavailable')
  view.rerender(<Surface />)
  const button = screen.getByRole('button')
  await act(async () => {
    useAppStore.getState().setSshTargetsMetadata([])
    fireEvent.click(button)
  })
  expect(owners.connect).not.toHaveBeenCalled()
})
it('uses only the reachable runtime SSH bucket and refuses local substitution when unverifiable', async () => {
  useAppStore.getState().setRuntimeEnvironmentStatus('env-a', {
    status: {
      runtimeId: 'runtime-a',
      rendererGraphEpoch: 1,
      graphStatus: 'ready',
      authoritativeWindowId: 7,
      liveTabCount: 0,
      liveLeafCount: 0
    },
    checkedAt: Date.now()
  })
  useAppStore
    .getState()
    .setEnvironmentSshTargetsMetadata('env-a', [{ id: 'host-a', label: 'Host A' }])
  useAppStore.getState().setEnvironmentSshConnectionState('env-a', 'host-a', state('disconnected'))
  owners.remote.mockImplementation(async () => {
    useAppStore.getState().setEnvironmentSshConnectionState('env-a', 'host-a', state('connected'))
    return state('connected')
  })
  render(<Surface remote />)
  await expect(
    invoke({ ...scope, expectedHostId: 'runtime:env-a', operation: 'ssh-workspace.host-connect' })
  ).resolves.toMatchObject({ applied: true })
  expect(owners.remote).toHaveBeenCalledExactlyOnceWith('env-a', 'host-a')
  expect(owners.connect).not.toHaveBeenCalled()
  await act(async () => {
    useAppStore
      .getState()
      .setEnvironmentSshConnectionState('env-a', 'host-a', state('disconnected'))
    useAppStore
      .getState()
      .setRuntimeEnvironmentStatus('env-a', { status: null, checkedAt: Date.now() })
  })
  await expect(
    invoke({ ...scope, expectedHostId: 'runtime:env-a', operation: 'ssh-workspace.host-connect' })
  ).rejects.toThrow('ssh_host_action_unavailable')
  expect(owners.remote).toHaveBeenCalledTimes(1)
})
