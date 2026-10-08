// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SshPane } from './SshPane'
import { TooltipProvider } from '../ui/tooltip'
import { useAppStore } from '@/store'
import { makeWorktree } from '@/store/slices/worktrees-slice-test-fixtures'
import { applySshConfirmationViewerRequest } from '@/runtime/ssh-confirmation-viewer-controller'
import { applySshConnectionsViewerRequest } from '@/runtime/ssh-connections-viewer-controller'
import type { ConnectionsViewerCommand } from '../../../../shared/rpc-contract/connections-viewer-params'
const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn() })
)
vi.mock('sonner', () => ({ toast }))
const target = {
  id: 'host-a',
  label: 'Host A',
  host: 'private-host-canary',
  username: 'fixture',
  port: 22
}
const connect = vi.fn(),
  disconnect = vi.fn(),
  test = vi.fn(),
  imported = vi.fn(),
  listTargets = vi.fn(),
  getState = vi.fn(),
  record = vi.fn(),
  resetRelay = vi.fn(),
  terminate = vi.fn(),
  remove = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({ recordFeatureInteraction: record })
  listTargets.mockResolvedValue([target])
  imported.mockResolvedValue({ targets: [target], repoReadoptions: [] })
  getState.mockResolvedValue(undefined)
  connect.mockImplementation(async () => {
    const state = {
      targetId: target.id,
      status: 'connected' as const,
      error: null,
      reconnectAttempt: 0
    }
    useAppStore.setState({ sshConnectionStates: new Map([[target.id, state]]) })
    return state
  })
  disconnect.mockImplementation(async () => {
    useAppStore.getState().setSshConnectionState(target.id, {
      targetId: target.id,
      status: 'disconnected',
      error: null,
      reconnectAttempt: 0
    })
  })
  test.mockResolvedValue({ success: true })
  resetRelay.mockResolvedValue(undefined)
  terminate.mockResolvedValue({ terminated: 0, unverifiable: 2 })
  remove.mockImplementation(async () => {
    listTargets.mockResolvedValue([])
  })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      ssh: {
        listTargets,
        importConfig: imported,
        connect,
        disconnect,
        testConnection: test,
        getState,
        resetRelay,
        terminateSessions: terminate,
        removeTarget: remove
      }
    }
  })
})
afterEach(() => {
  cleanup()
  useAppStore.setState(useAppStore.getInitialState(), true)
})
async function mount() {
  render(
    <TooltipProvider>
      <SshPane />
    </TooltipProvider>
  )
  await waitFor(() => expect(screen.getByText('Host A')).toBeVisible())
  imported.mockClear()
}
async function invoke(command: ConnectionsViewerCommand) {
  let pending:
    | ReturnType<typeof applySshConnectionsViewerRequest>
    | ReturnType<typeof applySshConfirmationViewerRequest>
    | undefined
  await act(async () => {
    const apply = command.operation.startsWith('ssh-confirmation.')
      ? applySshConfirmationViewerRequest
      : applySshConnectionsViewerRequest
    pending = apply({
      id: 'fixture',
      expiresAt: Date.now() + 500,
      command
    })
    void pending.catch(() => {})
  })
  if (!pending) {
    throw new Error('missing request')
  }
  return pending
}
it('shares actual card native connect/disconnect/test and explicit import owners with typed operations', async () => {
  await mount()
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Disconnect' })).toBeVisible())
  expect(connect).toHaveBeenCalledExactlyOnceWith({ targetId: target.id })
  await expect(
    invoke({
      viewerId: 7,
      operation: 'ssh.disconnect',
      targetId: target.id,
      confirmTarget: target.id
    })
  ).resolves.toMatchObject({ applied: true, persisted: null })
  expect(disconnect).toHaveBeenCalledExactlyOnceWith({ targetId: target.id })
  await expect(
    invoke({ viewerId: 7, operation: 'ssh.connect', targetId: target.id })
  ).resolves.toMatchObject({ applied: true })
  fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
  await waitFor(() => expect(disconnect).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Test' })).toBeVisible())
  fireEvent.click(screen.getByRole('button', { name: 'Test' }))
  await waitFor(() => expect(test).toHaveBeenCalledOnce())
  await expect(
    invoke({ viewerId: 7, operation: 'ssh.test', targetId: target.id })
  ).resolves.toMatchObject({ applied: true })
  fireEvent.click(screen.getByRole('button', { name: 'Import' }))
  await waitFor(() => expect(imported).toHaveBeenCalledExactlyOnceWith({ reAdopt: true }))
  const result = await invoke({
    viewerId: 7,
    operation: 'ssh.import',
    confirmTarget: 'ssh-config-all-hosts'
  })
  expect(result).toMatchObject({ applied: true, persisted: true })
  expect(imported).toHaveBeenCalledTimes(2)
  expect(record).toHaveBeenCalledWith('ssh')
  expect(JSON.stringify(result)).not.toContain('private-')
})
it('refuses false success and exact-target mismatch without exposing owner errors', async () => {
  await mount()
  connect.mockResolvedValueOnce({
    targetId: target.id,
    status: 'error',
    error: 'private-error-canary'
  })
  await expect(
    invoke({ viewerId: 7, operation: 'ssh.connect', targetId: target.id })
  ).resolves.toMatchObject({ applied: false })
  await expect(
    invoke({
      viewerId: 7,
      operation: 'ssh.disconnect',
      targetId: target.id,
      confirmTarget: 'other'
    })
  ).rejects.toThrow('confirm_target_mismatch')
  expect(disconnect).not.toHaveBeenCalled()
  await act(async () => {
    useAppStore.setState({
      sshConnectionStates: new Map([
        [target.id, { targetId: target.id, status: 'connected', error: null, reconnectAttempt: 0 }]
      ])
    })
  })
  disconnect.mockResolvedValueOnce(undefined)
  getState.mockResolvedValueOnce(null)
  await expect(
    invoke({
      viewerId: 7,
      operation: 'ssh.disconnect',
      targetId: target.id,
      confirmTarget: target.id
    })
  ).resolves.toMatchObject({ applied: false })
  await act(async () => {
    useAppStore.setState({ sshConnectionStates: new Map() })
  })
  test.mockResolvedValueOnce({ success: false, error: 'private-test-canary' })
  const failed = await invoke({ viewerId: 7, operation: 'ssh.test', targetId: target.id })
  expect(failed.applied).toBe(false)
  expect(JSON.stringify(failed)).not.toContain('private-')
  listTargets.mockResolvedValueOnce([])
  await expect(
    invoke({ viewerId: 7, operation: 'ssh.import', confirmTarget: 'ssh-config-all-hosts' })
  ).resolves.toMatchObject({ applied: false, persisted: false })
})

it('shares one in-flight owner between native and typed sibling requests', async () => {
  await mount()
  let resolveConnect: ((value: { targetId: string; status: 'connected' }) => void) | undefined
  connect.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveConnect = resolve
      })
  )
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
  await expect(
    invoke({ viewerId: 7, operation: 'ssh.connect', targetId: target.id })
  ).resolves.toMatchObject({ applied: false })
  expect(connect).toHaveBeenCalledOnce()
  await act(async () => {
    resolveConnect?.({ targetId: target.id, status: 'connected' })
  })
  connect.mockResolvedValueOnce({ targetId: 'other-host', status: 'connected' })
  await expect(
    invoke({ viewerId: 7, operation: 'ssh.connect', targetId: target.id })
  ).resolves.toMatchObject({ applied: false })
})
it('waits for committed viewer connection state and rejects a stale native card click', async () => {
  await mount()
  connect.mockResolvedValueOnce({
    targetId: target.id,
    status: 'connected',
    error: null,
    reconnectAttempt: 0
  })
  await expect(
    invoke({ viewerId: 7, operation: 'ssh.connect', targetId: target.id })
  ).resolves.toMatchObject({ applied: false, reason: 'viewer_not_applied' })
  connect.mockClear()
  const button = screen.getByRole('button', { name: 'Connect' })
  await act(async () => {
    useAppStore.setState({
      sshConnectionStates: new Map([
        [target.id, { targetId: target.id, status: 'connected', error: null, reconnectAttempt: 0 }]
      ])
    })
    fireEvent.click(button)
  })
  expect(connect).not.toHaveBeenCalled()
})
it('does not acknowledge imported fields when only the previous canonical target remains', async () => {
  await mount()
  imported.mockResolvedValueOnce({
    targets: [{ ...target, host: 'private-new-host-canary' }],
    repoReadoptions: []
  })
  const result = await invoke({
    viewerId: 7,
    operation: 'ssh.import',
    confirmTarget: 'ssh-config-all-hosts'
  })
  expect(result).toMatchObject({ applied: false, persisted: false })
  expect(JSON.stringify(result)).not.toContain('private-')
})
it('rejects absent metadata and a removed native row before calling connection owners', async () => {
  await mount()
  for (const operation of ['ssh.connect', 'ssh.test'] as const) {
    await expect(
      invoke({ viewerId: 7, operation, targetId: 'absent-host' })
    ).resolves.toMatchObject({ applied: false })
  }
  const button = screen.getByRole('button', { name: 'Connect' })
  await act(async () => {
    useAppStore.getState().setSshTargetsMetadata([])
    fireEvent.click(button)
  })
  expect(connect).not.toHaveBeenCalled()
  expect(test).not.toHaveBeenCalled()
  await expect(
    invoke({ viewerId: 7, operation: 'ssh.connect', targetId: target.id })
  ).resolves.toMatchObject({ applied: false })
  expect(connect).not.toHaveBeenCalled()
})
it('refuses connection operations while the existing SSH form is open', async () => {
  await mount()
  fireEvent.click(screen.getByRole('button', { name: 'Add Target' }))
  await expect(
    invoke({ viewerId: 7, operation: 'ssh.connect', targetId: target.id })
  ).rejects.toThrow('ssh_form_in_progress')
  expect(connect).not.toHaveBeenCalled()
  expect(test).not.toHaveBeenCalled()
  expect(disconnect).not.toHaveBeenCalled()
})
it('shares card reset and terminal termination confirmations with the actual pane owners', async () => {
  await mount()
  fireEvent.click(screen.getByRole('button', { name: 'Reset remote relay' }))
  expect(screen.getByRole('dialog')).toHaveTextContent('Reset Remote Relay?')
  expect(resetRelay).not.toHaveBeenCalled()
  await invoke({ viewerId: 7, operation: 'ssh-confirmation.cancel', kind: 'reset' })
  await invoke({
    viewerId: 7,
    operation: 'ssh-confirmation.request',
    kind: 'reset',
    targetId: target.id
  })
  await expect(
    invoke({
      viewerId: 7,
      operation: 'ssh-confirmation.confirm',
      kind: 'reset',
      confirmTarget: target.id
    })
  ).resolves.toMatchObject({ applied: true })
  expect(resetRelay).toHaveBeenCalledExactlyOnceWith({ targetId: target.id })
  fireEvent.click(screen.getByRole('button', { name: 'End remote terminals' }))
  expect(screen.getByRole('dialog')).toHaveTextContent('End Remote Terminals?')
  const result = await invoke({
    viewerId: 7,
    operation: 'ssh-confirmation.confirm',
    kind: 'terminate',
    confirmTarget: target.id
  })
  expect(result).toMatchObject({ applied: true, termination: { terminated: 0, unverifiable: 2 } })
  expect(terminate).toHaveBeenCalledExactlyOnceWith({ targetId: target.id })
  expect(toast.warning).toHaveBeenCalled()
  expect(screen.queryByRole('dialog')).toBeNull()
})
it('pairs native card edit/remove with exact typed form and removal callbacks', async () => {
  await mount()
  fireEvent.click(screen.getByRole('button', { name: 'Edit target' }))
  expect(screen.getByRole('dialog')).toBeVisible()
  await invoke({ viewerId: 7, operation: 'ssh.form-cancel' })
  await expect(
    invoke({ viewerId: 7, operation: 'ssh.form-edit', targetId: target.id })
  ).resolves.toMatchObject({ applied: true, state: { editingId: target.id } })
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  fireEvent.click(screen.getByRole('button', { name: 'Remove target' }))
  expect(screen.getByRole('dialog')).toBeVisible()
  expect(remove).not.toHaveBeenCalled()
  await invoke({ viewerId: 7, operation: 'ssh-confirmation.cancel', kind: 'remove' })
  await invoke({
    viewerId: 7,
    operation: 'ssh-confirmation.request',
    kind: 'remove',
    targetId: target.id
  })
  await expect(
    invoke({
      viewerId: 7,
      operation: 'ssh-confirmation.confirm',
      kind: 'remove',
      confirmTarget: 'wrong-host'
    })
  ).rejects.toThrow('confirm_target_mismatch')
  expect(remove).not.toHaveBeenCalled()
  await expect(
    invoke({
      viewerId: 7,
      operation: 'ssh-confirmation.confirm',
      kind: 'remove',
      confirmTarget: target.id
    })
  ).resolves.toMatchObject({ applied: true })
  expect(remove).toHaveBeenCalledExactlyOnceWith({ id: target.id })
  await waitFor(() => expect(screen.queryByText('Host A')).toBeNull())
})
it('opens the actual workspace-aware dialog from both native card and typed removal request', async () => {
  useAppStore.setState({
    repos: [
      {
        id: 'repo',
        path: '/work',
        displayName: 'Repo',
        addedAt: 0,
        badgeColor: '',
        connectionId: target.id,
        executionHostId: 'ssh:host-a'
      }
    ],
    worktreesByRepo: {
      repo: [makeWorktree({ id: 'repo::/work/a', repoId: 'repo', hostId: 'ssh:host-a' })]
    }
  })
  await mount()
  fireEvent.click(screen.getByRole('button', { name: 'Remove target' }))
  expect(screen.getByRole('dialog')).toHaveTextContent('Remove')
  expect(screen.getByRole('dialog')).toHaveTextContent('workspace')
  await expect(invoke({ viewerId: 7, operation: 'ssh-confirmation.get' })).resolves.toMatchObject({
    state: {
      workspaceRemoval: true,
      removeTargetId: target.id,
      workspaceDetails: { workspaceCount: 2, deleteWorkspaces: false }
    }
  })
  await invoke({ viewerId: 7, operation: 'ssh-confirmation.cancel', kind: 'remove' })
  await expect(
    invoke({
      viewerId: 7,
      operation: 'ssh-confirmation.request',
      kind: 'remove',
      targetId: target.id
    })
  ).resolves.toMatchObject({ applied: true, state: { workspaceRemoval: true } })
  expect(screen.getByRole('dialog')).toBeVisible()
  expect(remove).not.toHaveBeenCalled()
})
