// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { ForgetSshWorkspaceDialog } from './ForgetSshWorkspaceDialog'
import { applySshConfirmationViewerRequest } from '@/runtime/ssh-confirmation-viewer-controller'
import type { ConnectionsViewerCommand } from '../../../../shared/rpc-contract/connections-viewer-params'
import { toSshExecutionHostId } from '../../../../shared/execution-host'
const owners = vi.hoisted(() => ({
  remove: vi.fn(),
  connect: vi.fn(),
  delete: vi.fn(),
  toast: vi.fn()
}))
vi.mock('sonner', () => ({ toast: { error: owners.toast } }))
vi.mock('./delete-worktree-flow', () => ({ runWorktreeDeleteWithToast: owners.delete }))
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}
function modal(workspaceId = 'folder-a', targetId = 'host-a', ghost = false) {
  return {
    worktreeId: workspaceId,
    displayName: 'Folder',
    resolution: ghost
      ? { kind: 'ghost' as const, targetId }
      : { kind: 'disconnected' as const, targetId, status: 'disconnected' as const }
  }
}
const target = { viewerId: 7, workspaceId: 'folder-a', targetId: 'host-a' }
function request(command: ConnectionsViewerCommand) {
  return applySshConfirmationViewerRequest({
    id: 'workspace-fixture',
    expiresAt: Date.now() + 1000,
    command
  })
}
async function invoke(command: ConnectionsViewerCommand) {
  let pending: ReturnType<typeof request> | undefined
  await act(async () => {
    pending = request(command)
    void pending.catch(() => undefined)
  })
  if (!pending) {
    throw new Error('fixture_request_missing')
  }
  return pending
}
beforeEach(() => {
  vi.clearAllMocks()
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({ modalData: modal(), removeWorktree: owners.remove })
  owners.remove.mockResolvedValue({ ok: true })
  owners.connect.mockResolvedValue(undefined)
  owners.delete.mockResolvedValue(true)
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { ssh: { connect: owners.connect } }
  })
})
afterEach(() => {
  cleanup()
  useAppStore.setState(useAppStore.getInitialState(), true)
})
it('forgets only the exact folder workspace on the named SSH host through the existing owner', async () => {
  render(<ForgetSshWorkspaceDialog />)
  expect(
    await invoke({
      ...target,
      operation: 'ssh-workspace.forget-local',
      confirmTarget: target.workspaceId
    })
  ).toMatchObject({ applied: true, state: { workspaceForget: { dialogOpen: false } } })
  expect(owners.remove).toHaveBeenCalledWith(
    { id: target.workspaceId, executionHostId: toSshExecutionHostId(target.targetId) },
    false,
    { mode: 'forget-local' }
  )
  expect(owners.connect).not.toHaveBeenCalled()
  expect(owners.delete).not.toHaveBeenCalled()
})
it('preserves a failed forget and rejects a mismatched host or exact confirmation before any owner call', async () => {
  render(<ForgetSshWorkspaceDialog />)
  await expect(
    invoke({
      ...target,
      targetId: 'other-host',
      operation: 'ssh-workspace.forget-local',
      confirmTarget: target.workspaceId
    })
  ).rejects.toThrow('confirm_target_mismatch')
  await expect(
    invoke({ ...target, operation: 'ssh-workspace.forget-local', confirmTarget: 'other-workspace' })
  ).rejects.toThrow('confirm_target_mismatch')
  expect(owners.remove).not.toHaveBeenCalled()
  owners.remove.mockResolvedValueOnce({ ok: false, error: 'private-owner-error-canary' })
  const result = await invoke({
    ...target,
    operation: 'ssh-workspace.forget-local',
    confirmTarget: target.workspaceId
  })
  expect(result).toMatchObject({ applied: false, state: { workspaceForget: { dialogOpen: true } } })
  expect(JSON.stringify(result)).not.toContain('canary')
})
it('awaits reconnect and the canonical deletion result rather than the earlier dialog close', async () => {
  const pending = deferred<boolean>()
  owners.delete.mockReturnValueOnce(pending.promise)
  render(<ForgetSshWorkspaceDialog />)
  let applying: ReturnType<typeof request> | undefined
  let settled = false
  await act(async () => {
    applying = request({
      ...target,
      operation: 'ssh-workspace.reconnect-delete',
      confirmTarget: target.workspaceId
    })
    void applying.then(() => {
      settled = true
    })
  })
  expect(owners.connect).toHaveBeenCalledWith({ targetId: 'host-a' })
  expect(owners.delete).toHaveBeenCalledWith(
    { id: 'folder-a', executionHostId: toSshExecutionHostId('host-a') },
    'Folder'
  )
  expect(settled).toBe(false)
  await act(async () => {
    pending.resolve(false)
  })
  expect(await applying).toMatchObject({ applied: false })
})
it('does not delete or close a replacement modal after a pending reconnect', async () => {
  const pending = deferred<void>()
  owners.connect.mockReturnValueOnce(pending.promise)
  render(<ForgetSshWorkspaceDialog />)
  let applying: ReturnType<typeof request> | undefined
  await act(async () => {
    applying = request({
      ...target,
      operation: 'ssh-workspace.reconnect-delete',
      confirmTarget: target.workspaceId
    })
  })
  const replacement = modal('folder-b', 'host-b')
  await act(async () => {
    useAppStore.setState({ modalData: replacement })
    pending.resolve()
  })
  expect(await applying).toMatchObject({
    applied: false,
    state: { workspaceForget: { workspaceId: 'folder-b', targetId: 'host-b', dialogOpen: true } }
  })
  expect(owners.delete).not.toHaveBeenCalled()
  expect(useAppStore.getState().modalData).toBe(replacement)
})
it('guards sibling native/typed calls synchronously and never closes a newer modal on forget completion', async () => {
  const pending = deferred<{ ok: true }>()
  owners.remove.mockReturnValueOnce(pending.promise)
  render(<ForgetSshWorkspaceDialog />)
  let applying: ReturnType<typeof request> | undefined
  await act(async () => {
    applying = request({
      ...target,
      operation: 'ssh-workspace.forget-local',
      confirmTarget: target.workspaceId
    })
    fireEvent.click(screen.getByRole('button', { name: 'Remove from Orca' }))
  })
  expect(owners.remove).toHaveBeenCalledTimes(1)
  expect(await invoke({ ...target, operation: 'ssh-workspace.get' })).toMatchObject({
    applied: true,
    state: { workspaceForget: { busy: true } }
  })
  const replacement = modal('folder-b', 'host-b')
  await act(async () => {
    useAppStore.setState({ modalData: replacement })
    pending.resolve({ ok: true })
  })
  expect(await applying).toMatchObject({ applied: false })
  expect(useAppStore.getState().modalData).toBe(replacement)
})
it('preserves ghost-host forget and native cancel semantics without reconnecting', async () => {
  useAppStore.setState({ modalData: modal('folder-a', 'host-a', true) })
  render(<ForgetSshWorkspaceDialog />)
  await expect(
    invoke({
      ...target,
      operation: 'ssh-workspace.reconnect-delete',
      confirmTarget: target.workspaceId
    })
  ).rejects.toThrow('ssh_reconnect_unavailable')
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(owners.connect).not.toHaveBeenCalled()
  expect(owners.remove).not.toHaveBeenCalled()
  expect(useAppStore.getState().modalData).not.toHaveProperty('worktreeId')
})

it('confirms reconnect deletion success and typed cancellation through the existing modal owner', async () => {
  render(<ForgetSshWorkspaceDialog />)
  expect(await invoke({ ...target, operation: 'ssh-workspace.get' })).toMatchObject({
    applied: true,
    state: { workspaceForget: { dialogOpen: true, canReconnect: true } }
  })
  expect(
    await invoke({
      ...target,
      operation: 'ssh-workspace.reconnect-delete',
      confirmTarget: target.workspaceId
    })
  ).toMatchObject({ applied: true, state: { workspaceForget: { dialogOpen: false } } })
  await act(async () => {
    useAppStore.setState({ modalData: modal() })
  })
  expect(await invoke({ ...target, operation: 'ssh-workspace.cancel' })).toMatchObject({
    applied: true,
    state: { workspaceForget: { dialogOpen: false } }
  })
  expect(owners.delete).toHaveBeenCalledTimes(1)
})
it('keeps a replacement dialog after an already started remote deletion completes', async () => {
  const pending = deferred<boolean>()
  owners.delete.mockReturnValueOnce(pending.promise)
  render(<ForgetSshWorkspaceDialog />)
  let applying: ReturnType<typeof request> | undefined
  await act(async () => {
    applying = request({
      ...target,
      operation: 'ssh-workspace.reconnect-delete',
      confirmTarget: target.workspaceId
    })
  })
  const replacement = modal('folder-b', 'host-b')
  await act(async () => {
    useAppStore.setState({ modalData: replacement })
    pending.resolve(true)
  })
  expect(await applying).toMatchObject({ applied: false })
  expect(useAppStore.getState().modalData).toBe(replacement)
})
it('uses the same exact host-qualified local-only owner for a native ghost removal', async () => {
  useAppStore.setState({ modalData: modal('folder-a', 'host-a', true) })
  render(<ForgetSshWorkspaceDialog />)
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Remove from Orca' }))
  })
  expect(owners.remove).toHaveBeenCalledWith(
    { id: 'folder-a', executionHostId: toSshExecutionHostId('host-a') },
    false,
    { mode: 'forget-local' }
  )
  expect(useAppStore.getState().modalData).not.toHaveProperty('worktreeId')
  expect(owners.connect).not.toHaveBeenCalled()
})
it('preserves the replacement modal for the native reconnect button as well as the typed path', async () => {
  const pending = deferred<void>()
  owners.connect.mockReturnValueOnce(pending.promise)
  render(<ForgetSshWorkspaceDialog />)
  fireEvent.click(screen.getByRole('button', { name: 'Reconnect & Delete' }))
  const replacement = modal('folder-b', 'host-b')
  await act(async () => {
    useAppStore.setState({ modalData: replacement })
    pending.resolve()
  })
  expect(owners.delete).not.toHaveBeenCalled()
  expect(useAppStore.getState().modalData).toBe(replacement)
})
function ConditionalDialogFixture() {
  const active = useAppStore((state) => state.activeModal)
  return active === 'forget-ssh-workspace' ? <ForgetSshWorkspaceDialog /> : null
}
it('acknowledges canonical removal when the real modal owner intentionally unmounts its dialog', async () => {
  useAppStore.setState({ activeModal: 'forget-ssh-workspace' })
  render(<ConditionalDialogFixture />)
  expect(
    await invoke({
      ...target,
      operation: 'ssh-workspace.forget-local',
      confirmTarget: target.workspaceId
    })
  ).toMatchObject({ applied: true, state: { workspaceForget: { dialogOpen: false } } })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(owners.remove).toHaveBeenCalledTimes(1)
})

it('awaits a failed canonical remote delete after intentional modal unmount and preserves unrelated unmount rejection', async () => {
  useAppStore.setState({ activeModal: 'forget-ssh-workspace' })
  const pending = deferred<boolean>()
  owners.delete.mockReturnValueOnce(pending.promise)
  const view = render(<ConditionalDialogFixture />)
  let applying: ReturnType<typeof request> | undefined
  await act(async () => {
    applying = request({
      ...target,
      operation: 'ssh-workspace.reconnect-delete',
      confirmTarget: target.workspaceId
    })
    void applying.catch(() => undefined)
  })
  expect(screen.queryByRole('dialog')).toBeNull()
  await act(async () => {
    pending.resolve(false)
  })
  expect(await applying).toMatchObject({
    applied: false,
    state: { workspaceForget: { dialogOpen: false } }
  })
  view.unmount()
  const forget = deferred<{ ok: true }>()
  owners.remove.mockReturnValueOnce(forget.promise)
  useAppStore.setState({ modalData: modal() })
  const unrelated = render(<ForgetSshWorkspaceDialog />)
  await act(async () => {
    applying = request({
      ...target,
      operation: 'ssh-workspace.forget-local',
      confirmTarget: target.workspaceId
    })
    void applying.catch(() => undefined)
  })
  unrelated.unmount()
  await act(async () => {
    forget.resolve({ ok: true })
  })
  await expect(applying).rejects.toThrow('connections_surface_unavailable')
})
