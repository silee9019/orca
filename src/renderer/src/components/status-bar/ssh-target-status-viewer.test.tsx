// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SshTargetStatusRow } from './SshTargetStatusRow'
import { useAppStore } from '@/store'
import { applySshConfirmationViewerRequest } from '@/runtime/ssh-confirmation-viewer-controller'
import type { ConnectionsViewerCommand } from '../../../../shared/rpc-contract/connections-viewer-params'
import { resetSshConnectInFlightForTests } from '@/ssh/ssh-connect-in-flight'
const owners = vi.hoisted(() => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  get: vi.fn(),
  feature: vi.fn()
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
function state(status: 'connected' | 'disconnected') {
  return { targetId: 'host-a', status, error: null, reconnectAttempt: 0 }
}
function Surface() {
  const status = useAppStore(
    (value) => value.sshConnectionStates.get('host-a')?.status ?? 'disconnected'
  )
  return (
    <SshTargetStatusRow targetId="host-a" label="Host A" status={status} syncStatus={undefined} />
  )
}
const scope = {
  viewerId: 7,
  surface: 'status-row' as const,
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
it('shares actual native and typed status-row owners with canonical and committed state readback', async () => {
  render(<Surface />)
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Disconnect' })).toBeVisible())
  expect(owners.connect).toHaveBeenCalledExactlyOnceWith({ targetId: 'host-a' })
  await expect(
    invoke({ ...scope, operation: 'ssh-workspace.host-disconnect', confirmTarget: 'host-a' })
  ).resolves.toMatchObject({ applied: true, state: { workspaceForget: { connected: false } } })
  await expect(
    invoke({ ...scope, operation: 'ssh-workspace.host-connect' })
  ).resolves.toMatchObject({ applied: true, state: { workspaceForget: { connected: true } } })
  fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Connect' })).toBeVisible())
  expect(owners.disconnect).toHaveBeenCalledTimes(2)
  expect(owners.get).toHaveBeenCalledTimes(2)
  expect(owners.feature).toHaveBeenCalledWith('ssh')
})
it('rejects wrong host, wrong target, wrong confirmation and a same-turn stale native row before owner calls', async () => {
  render(<Surface />)
  await expect(
    invoke({ ...scope, operation: 'ssh-workspace.host-connect', expectedHostId: 'runtime:env-a' })
  ).rejects.toThrow('connections_surface_unavailable')
  await expect(
    invoke({ ...scope, operation: 'ssh-workspace.host-connect', targetId: 'host-b' })
  ).rejects.toThrow('connections_surface_unavailable')
  await expect(
    invoke({ ...scope, operation: 'ssh-workspace.host-disconnect', confirmTarget: 'wrong' })
  ).rejects.toThrow('confirm_target_mismatch')
  const button = screen.getByRole('button', { name: 'Connect' })
  await act(async () => {
    useAppStore.getState().setSshTargetsMetadata([])
    fireEvent.click(button)
  })
  expect(owners.connect).not.toHaveBeenCalled()
  expect(owners.disconnect).not.toHaveBeenCalled()
})
it('shares a synchronous native/typed busy guard and refuses unknown canonical disconnection', async () => {
  let finish: ((value: ReturnType<typeof state>) => void) | undefined
  owners.connect.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  render(<Surface />)
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
  await expect(invoke({ ...scope, operation: 'ssh-workspace.host-connect' })).rejects.toThrow(
    'ssh_host_action_unavailable'
  )
  expect(owners.connect).toHaveBeenCalledOnce()
  await act(async () => {
    useAppStore.getState().setSshConnectionState('host-a', state('connected'))
    finish?.(state('connected'))
  })
  owners.disconnect.mockResolvedValueOnce(undefined)
  owners.get.mockResolvedValueOnce(null)
  await expect(
    invoke({ ...scope, operation: 'ssh-workspace.host-disconnect', confirmTarget: 'host-a' })
  ).resolves.toMatchObject({ applied: false })
})
it('refuses ambiguous status rows and pending completion after unmount', async () => {
  const view = render(
    <>
      <Surface />
      <Surface />
    </>
  )
  await expect(invoke({ ...scope, operation: 'ssh-workspace.host-connect' })).rejects.toThrow(
    'connections_viewer_ambiguous'
  )
  expect(owners.connect).not.toHaveBeenCalled()
  view.rerender(<Surface />)
  let finish: ((value: ReturnType<typeof state>) => void) | undefined
  owners.connect.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  let pending: ReturnType<typeof applySshConfirmationViewerRequest> | undefined
  await act(async () => {
    pending = applySshConfirmationViewerRequest({
      id: 'pending',
      expiresAt: Date.now() + 500,
      command: { ...scope, operation: 'ssh-workspace.host-connect' }
    })
    void pending.catch(() => {})
  })
  view.unmount()
  await act(async () => {
    finish?.(state('connected'))
  })
  await expect(pending).rejects.toThrow('connections_surface_unavailable')
})
