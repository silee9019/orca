// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TerminalSshReconnectOverlay } from './TerminalSshReconnectOverlay'
import RemoveFolderDialog from '../sidebar/RemoveFolderDialog'
import { ForgetSshWorkspaceDialog } from '../sidebar/ForgetSshWorkspaceDialog'
import { useAppStore } from '@/store'
import { makeFolderWorkspace, makeWorktree } from '@/store/slices/worktrees-slice-test-fixtures'
import { applySshConfirmationViewerRequest } from '@/runtime/ssh-confirmation-viewer-controller'
import type { ConnectionsViewerCommand } from '../../../../shared/rpc-contract/connections-viewer-params'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import { getDefaultSettings } from '../../../../shared/constants'
import { resetSshConnectInFlightForTests } from '@/ssh/ssh-connect-in-flight'
const owners = vi.hoisted(() => ({
  connect: vi.fn(),
  remote: vi.fn(),
  remove: vi.fn(),
  folder: vi.fn(),
  project: vi.fn()
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/runtime/runtime-environment-ssh-state', () => ({
  connectRuntimeEnvironmentSshTarget: owners.remote,
  resyncRuntimeEnvironmentSshTargets: vi.fn()
}))
const workspaceId = 'repo::/work/same'
function repo(host: ExecutionHostId) {
  return {
    id: 'repo',
    path: '/work',
    displayName: 'Repo',
    addedAt: 0,
    badgeColor: '',
    connectionId: 'host-a',
    executionHostId: host
  }
}
function installRows() {
  useAppStore.setState({
    repos: [repo('ssh:host-a'), repo('runtime:env-a')],
    worktreesByRepo: {
      local: [makeWorktree({ id: workspaceId, repoId: 'repo', hostId: 'ssh:host-a' })],
      remote: [makeWorktree({ id: workspaceId, repoId: 'repo', hostId: 'runtime:env-a' })]
    },
    removeWorktree: owners.remove
  })
}
function reachable() {
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
}
function Surface({
  remote = false,
  removed = false,
  id = workspaceId
}: {
  remote?: boolean
  removed?: boolean
  id?: string
}) {
  const modal = useAppStore((state) => state.activeModal)
  return (
    <>
      <TerminalSshReconnectOverlay
        targetId="host-a"
        targetLabel="Host A"
        status="disconnected"
        worktreeId={id}
        targetRemoved={removed}
        sshOwnerEnvironmentId={remote ? 'env-a' : null}
      />
      {modal === 'forget-ssh-workspace' && <ForgetSshWorkspaceDialog />}
      {modal === 'confirm-remove-folder' && <RemoveFolderDialog />}
    </>
  )
}
async function invoke(command: ConnectionsViewerCommand) {
  let pending: ReturnType<typeof applySshConfirmationViewerRequest> | undefined
  await act(async () => {
    pending = applySshConfirmationViewerRequest({
      id: 'overlay-fixture',
      expiresAt: Date.now() + 500,
      command
    })
    void pending.catch(() => {})
  })
  if (!pending) {
    throw new Error('missing_request')
  }
  return pending
}
beforeEach(() => {
  vi.clearAllMocks()
  resetSshConnectInFlightForTests()
  useAppStore.setState(useAppStore.getInitialState(), true)
  installRows()
  owners.connect.mockImplementation(async () => {
    const state = {
      targetId: 'host-a',
      status: 'connected' as const,
      error: null,
      reconnectAttempt: 0
    }
    useAppStore.getState().setSshConnectionState('host-a', state)
    return state
  })
  owners.remote.mockImplementation(async () => {
    const state = {
      targetId: 'host-a',
      status: 'connected' as const,
      error: null,
      reconnectAttempt: 0
    }
    useAppStore.getState().setEnvironmentSshConnectionState('env-a', 'host-a', state)
    return state
  })
  owners.remove.mockResolvedValue({ ok: true })
  owners.folder.mockResolvedValue(true)
  useAppStore.setState({ deleteFolderWorkspace: owners.folder, removeProject: owners.project })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { ssh: { connect: owners.connect } }
  })
})
afterEach(() => {
  cleanup()
  resetSshConnectInFlightForTests()
  useAppStore.setState(useAppStore.getInitialState(), true)
})
it('shares native and typed overlay connects while retaining the runtime owner', async () => {
  useAppStore.getState().setSshTargetsMetadata([{ id: 'host-a', label: 'Host A' }])
  const native = render(<Surface />)
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
  await waitFor(() => expect(owners.connect).toHaveBeenCalledOnce())
  native.unmount()
  useAppStore.setState({ sshConnectionStates: new Map() })
  render(<Surface />)
  await expect(
    invoke({
      viewerId: 7,
      operation: 'ssh-workspace.connect',
      workspaceId,
      targetId: 'host-a',
      expectedHostId: 'ssh:host-a'
    })
  ).resolves.toMatchObject({ applied: true })
  cleanup()
  reachable()
  useAppStore
    .getState()
    .setEnvironmentSshTargetsMetadata('env-a', [{ id: 'host-a', label: 'Remote A' }])
  useAppStore.getState().setEnvironmentSshConnectionState('env-a', 'host-a', {
    targetId: 'host-a',
    status: 'disconnected',
    error: null,
    reconnectAttempt: 0
  })
  render(<Surface remote />)
  await expect(
    invoke({
      viewerId: 7,
      operation: 'ssh-workspace.connect',
      workspaceId,
      targetId: 'host-a',
      expectedHostId: 'runtime:env-a'
    })
  ).resolves.toMatchObject({ applied: true })
  expect(owners.remote).toHaveBeenCalledExactlyOnceWith('env-a', 'host-a')
  expect(owners.connect).toHaveBeenCalledTimes(2)
})
it('requests the existing confirmation without deletion and preserves colliding runtime host on exact confirmation', async () => {
  reachable()
  useAppStore.getState().setEnvironmentSshTargetsMetadata('env-a', [])
  useAppStore.setState({
    settings: { ...getDefaultSettings('/fixture'), skipDeleteWorktreeConfirm: true }
  })
  render(<Surface remote removed />)
  fireEvent.click(screen.getByRole('button', { name: 'Remove workspace' }))
  await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible())
  expect(useAppStore.getState().modalData).toMatchObject({
    worktreeId: workspaceId,
    expectedHostId: 'runtime:env-a'
  })
  expect(owners.remove).not.toHaveBeenCalled()
  await expect(
    invoke({
      viewerId: 7,
      operation: 'ssh-workspace.forget-local',
      workspaceId,
      targetId: 'host-a',
      confirmTarget: workspaceId,
      expectedHostId: 'ssh:host-a'
    })
  ).rejects.toThrow('confirm_target_mismatch')
  expect(owners.remove).not.toHaveBeenCalled()
  await expect(
    invoke({
      viewerId: 7,
      operation: 'ssh-workspace.cancel',
      workspaceId,
      targetId: 'host-a',
      expectedHostId: 'runtime:env-a'
    })
  ).resolves.toMatchObject({ applied: true })
  await expect(
    invoke({
      viewerId: 7,
      operation: 'ssh-workspace.request',
      workspaceId,
      targetId: 'host-a',
      expectedHostId: 'runtime:env-a'
    })
  ).resolves.toMatchObject({
    applied: true,
    state: { workspaceForget: { dialogOpen: true, expectedHostId: 'runtime:env-a' } }
  })
  await expect(
    invoke({
      viewerId: 7,
      operation: 'ssh-workspace.forget-local',
      workspaceId,
      targetId: 'host-a',
      confirmTarget: workspaceId,
      expectedHostId: 'runtime:env-a'
    })
  ).resolves.toMatchObject({ applied: true })
  expect(owners.remove).toHaveBeenCalledExactlyOnceWith(
    { id: workspaceId, executionHostId: 'runtime:env-a' },
    false,
    { mode: 'forget-local' }
  )
  expect(useAppStore.getState().worktreesByRepo.local).toHaveLength(1)
  expect(owners.connect).not.toHaveBeenCalled()
})
it('rejects unverifiable runtime and stale native removed target requests without owner side effects', async () => {
  useAppStore.getState().setEnvironmentSshTargetsMetadata('env-a', [])
  render(<Surface remote removed />)
  fireEvent.click(screen.getByRole('button', { name: 'Remove workspace' }))
  expect(useAppStore.getState().activeModal).toBe('none')
  await expect(
    invoke({
      viewerId: 7,
      operation: 'ssh-workspace.request',
      workspaceId,
      targetId: 'host-a',
      expectedHostId: 'runtime:env-a'
    })
  ).rejects.toThrow('ssh_workspace_action_unavailable')
  reachable()
  await act(async () => {
    useAppStore
      .getState()
      .setEnvironmentSshTargetsMetadata('env-a', [{ id: 'host-a', label: 'Restored' }])
    fireEvent.click(screen.getByRole('button', { name: 'Remove workspace' }))
  })
  expect(useAppStore.getState().activeModal).toBe('none')
  expect(owners.remove).not.toHaveBeenCalled()
})
it('rejects same-turn stale native connect and an exact-host mismatch before side effects', async () => {
  render(<Surface />)
  const button = screen.getByRole('button', { name: 'Connect' })
  await act(async () => {
    useAppStore.getState().setSshConnectionState('host-a', {
      targetId: 'host-a',
      status: 'connected',
      error: null,
      reconnectAttempt: 0
    })
    fireEvent.click(button)
  })
  expect(owners.connect).not.toHaveBeenCalled()
  await expect(
    invoke({
      viewerId: 7,
      operation: 'ssh-workspace.connect',
      workspaceId,
      targetId: 'host-a',
      expectedHostId: 'runtime:env-a'
    })
  ).rejects.toThrow('connections_surface_unavailable')
  expect(owners.remote).not.toHaveBeenCalled()
})
it('acknowledges only the exact main project confirmation, without treating it as workspace deletion', async () => {
  useAppStore.getState().setSshTargetsMetadata([])
  useAppStore.setState({
    worktreesByRepo: {
      local: [
        makeWorktree({
          id: workspaceId,
          repoId: 'repo',
          hostId: 'ssh:host-a',
          isMainWorktree: true
        })
      ]
    },
    settings: { ...getDefaultSettings('/fixture'), skipDeleteWorktreeConfirm: true }
  })
  render(<Surface removed />)
  await expect(
    invoke({
      viewerId: 7,
      operation: 'ssh-workspace.request',
      workspaceId,
      targetId: 'host-a',
      expectedHostId: 'ssh:host-a'
    })
  ).resolves.toMatchObject({
    applied: true,
    state: { workspaceForget: { confirmationKind: 'project', dialogOpen: true } }
  })
  expect(screen.getByRole('dialog')).toBeVisible()
  expect(screen.getByText('Remove Project')).toBeVisible()
  expect(useAppStore.getState().modalData).toMatchObject({ repoId: 'repo', hostId: 'ssh:host-a' })
  await expect(
    invoke({
      viewerId: 7,
      operation: 'ssh-workspace.forget-local',
      workspaceId,
      targetId: 'host-a',
      expectedHostId: 'ssh:host-a',
      confirmTarget: workspaceId
    })
  ).rejects.toThrow('connections_surface_unavailable')
  expect(owners.project).not.toHaveBeenCalled()
  expect(owners.remove).not.toHaveBeenCalled()
})
it('confirms independent folder metadata removal on its runtime host and preserves the same folder ID elsewhere', async () => {
  reachable()
  useAppStore.getState().setEnvironmentSshTargetsMetadata('env-a', [])
  const id = 'folder:folder-a'
  const local = makeFolderWorkspace({
    id: 'folder-a',
    connectionId: 'host-a',
    executionHostId: 'ssh:host-a'
  })
  const remote = makeFolderWorkspace({
    id: 'folder-a',
    connectionId: 'host-a',
    executionHostId: 'runtime:env-a'
  })
  useAppStore.setState({ folderWorkspaces: [local, remote] })
  owners.folder.mockImplementation(async (_id: string, options: { executionHostId: string }) => {
    useAppStore.setState({
      folderWorkspaces: useAppStore
        .getState()
        .folderWorkspaces.filter((entry) => entry.executionHostId !== options.executionHostId)
    })
    return true
  })
  render(<Surface remote removed id={id} />)
  await expect(
    invoke({
      viewerId: 7,
      operation: 'ssh-workspace.request',
      workspaceId: id,
      targetId: 'host-a',
      expectedHostId: 'runtime:env-a'
    })
  ).resolves.toMatchObject({
    applied: true,
    state: { workspaceForget: { confirmationKind: 'folder', dialogOpen: true } }
  })
  expect(screen.getByRole('dialog')).toBeVisible()
  expect(owners.folder).not.toHaveBeenCalled()
  await expect(
    invoke({
      viewerId: 7,
      operation: 'ssh-workspace.forget-local',
      workspaceId: id,
      targetId: 'host-a',
      expectedHostId: 'ssh:host-a',
      confirmTarget: id
    })
  ).rejects.toThrow('confirm_target_mismatch')
  expect(owners.folder).not.toHaveBeenCalled()
  await expect(
    invoke({
      viewerId: 7,
      operation: 'ssh-workspace.forget-local',
      workspaceId: id,
      targetId: 'host-a',
      expectedHostId: 'runtime:env-a',
      confirmTarget: id
    })
  ).resolves.toMatchObject({ applied: true })
  expect(owners.folder).toHaveBeenCalledExactlyOnceWith('folder-a', {
    executionHostId: 'runtime:env-a'
  })
  expect(useAppStore.getState().folderWorkspaces).toEqual([local])
  expect(owners.remove).not.toHaveBeenCalled()
})
it('keeps the folder confirmation open when a successful owner response has no canonical removal', async () => {
  useAppStore.getState().setSshTargetsMetadata([])
  const id = 'folder:folder-a'
  useAppStore.setState({
    folderWorkspaces: [
      makeFolderWorkspace({ id: 'folder-a', connectionId: 'host-a', executionHostId: 'ssh:host-a' })
    ]
  })
  render(<Surface removed id={id} />)
  await invoke({
    viewerId: 7,
    operation: 'ssh-workspace.request',
    workspaceId: id,
    targetId: 'host-a',
    expectedHostId: 'ssh:host-a'
  })
  const result = await invoke({
    viewerId: 7,
    operation: 'ssh-workspace.forget-local',
    workspaceId: id,
    targetId: 'host-a',
    expectedHostId: 'ssh:host-a',
    confirmTarget: id
  })
  expect(result).toMatchObject({
    applied: false,
    state: { workspaceForget: { dialogOpen: true, confirmationKind: 'folder' } }
  })
  expect(screen.getByRole('dialog')).toBeVisible()
  expect(owners.folder).toHaveBeenCalledExactlyOnceWith('folder-a', {
    executionHostId: 'ssh:host-a'
  })
})
