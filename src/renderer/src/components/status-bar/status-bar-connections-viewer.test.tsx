// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SshStatusSegment } from './SshStatusSegment'
import { StatusBarVisibilityMenu } from './StatusBarVisibilityMenu'
import { useStatusBarController } from './use-status-bar-controller'
import { useAppStore } from '@/store'
import { createGlobalSettingsFixture } from '../../../../shared/global-settings-test-fixture'
import { applyStatusBarConnectionsViewerRequest } from '@/runtime/status-bar-connections-viewer-controller'
import type { StatusBarConnectionsViewerCommand } from '../../../../shared/rpc-contract/status-bar-connections-viewer-params'
const owners = vi.hoisted(() => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  repos: vi.fn(),
  worktrees: vi.fn(),
  lineage: vi.fn(),
  hydrate: vi.fn(),
  snapshots: vi.fn(),
  feature: vi.fn(),
  set: vi.fn(),
  get: vi.fn()
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), warning: vi.fn() } }))
const environment = {
  id: 'env-a',
  name: 'Server A',
  createdAt: 1,
  updatedAt: 1,
  lastUsedAt: null,
  runtimeId: 'runtime-a',
  endpoints: [],
  preferredEndpointId: 'ep-a'
}
let sequence = 0
const runtime = {
  runtimeId: 'runtime-a',
  rendererGraphEpoch: 1,
  graphStatus: 'ready' as const,
  authoritativeWindowId: 7,
  liveTabCount: 0,
  liveLeafCount: 0
}
function status(connected: boolean) {
  useAppStore.getState().setRuntimeEnvironmentStatus('env-a', {
    status: connected ? runtime : null,
    checkedAt: Date.now()
  })
}
async function invoke(command: StatusBarConnectionsViewerCommand) {
  let pending: ReturnType<typeof applyStatusBarConnectionsViewerRequest> | undefined
  await act(async () => {
    pending = applyStatusBarConnectionsViewerRequest({
      id: 'statusbar-fixture',
      expiresAt: Date.now() + 600,
      command: { ...command, viewerId: 7 }
    })
    void pending.catch(() => {})
  })
  if (!pending) {
    throw new Error('fixture_missing')
  }
  return pending
}
function Visibility() {
  const controller = useStatusBarController(false)
  if (!controller) {
    return null
  }
  return (
    <>
      <button onClick={() => controller.setMenuOpen(true)}>Visibility</button>
      <StatusBarVisibilityMenu controller={controller} />
    </>
  )
}
beforeEach(() => {
  vi.clearAllMocks()
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({
    settings: createGlobalSettingsFixture(),
    runtimeEnvironments: [environment],
    fetchRuntimeEnvironmentRepos: owners.repos,
    fetchWorktrees: owners.worktrees,
    fetchWorktreeLineage: owners.lineage,
    hydrateRuntimeEnvironmentStatuses: owners.hydrate,
    readRuntimeHostStatusSnapshots: owners.snapshots,
    recordFeatureInteraction: owners.feature,
    ensureDetectedAgents: vi.fn()
  })
  status(false)
  owners.hydrate.mockResolvedValue(undefined)
  owners.repos.mockResolvedValue([{ id: 'repo-a' }])
  owners.worktrees.mockResolvedValue(undefined)
  owners.lineage.mockResolvedValue(undefined)
  sequence = 0
  owners.connect.mockImplementation(async () => {
    useAppStore.getState().applyRuntimeHostStatusSnapshot({
      environmentId: 'env-a',
      pairingRevision: 1,
      sequence: ++sequence,
      checkedAt: Date.now(),
      status: runtime,
      verification: 'verified',
      transport: 'ready'
    })
    return { ok: true, result: runtime }
  })
  owners.disconnect.mockResolvedValue(undefined)
  owners.snapshots.mockImplementation(async () =>
    useAppStore.getState().applyRuntimeHostStatusSnapshot({
      environmentId: 'env-a',
      pairingRevision: 1,
      sequence: ++sequence,
      checkedAt: Date.now(),
      status: null,
      verification: 'unavailable',
      transport: 'disconnected',
      retired: true
    })
  )
  let saved = useAppStore.getState().statusBarItems
  owners.set.mockImplementation(async (value: { statusBarItems?: typeof saved }) => {
    if (value.statusBarItems) {
      saved = value.statusBarItems
    }
  })
  owners.get.mockImplementation(async () => ({ statusBarItems: saved }))
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      runtimeEnvironments: { connect: owners.connect, disconnect: owners.disconnect },
      ui: { set: owners.set, get: owners.get }
    }
  })
})
afterEach(() => {
  cleanup()
  useAppStore.setState(useAppStore.getInitialState(), true)
})
it('shares actual dropdown hydration, server navigation, disconnect snapshots and manage settings owners', async () => {
  render(<SshStatusSegment compact={false} iconOnly={false} />)
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Remote host connection status' }), {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse'
  })
  await screen.findByRole('button', { name: 'Connect' })
  expect(owners.hydrate).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
  await waitFor(() => expect(owners.lineage).toHaveBeenCalledOnce())
  expect(owners.connect).toHaveBeenCalledExactlyOnceWith({ selector: 'env-a', timeoutMs: 5000 })
  expect(owners.repos).toHaveBeenCalledExactlyOnceWith('env-a')
  expect(owners.worktrees).toHaveBeenCalledExactlyOnceWith('repo-a', {
    executionHostId: 'runtime:env-a',
    suppressRemoteLineageRefresh: true
  })
  expect(owners.lineage).toHaveBeenCalledExactlyOnceWith({ executionHostId: 'runtime:env-a' })
  await expect(
    invoke({
      viewerId: 7,
      operation: 'status-bar.runtime-disconnect',
      environmentId: 'env-a',
      expectedHostId: 'runtime:env-a',
      confirmTarget: 'env-a'
    })
  ).resolves.toMatchObject({
    applied: true,
    state: { statusBar: { runtimeState: 'disconnected' } }
  })
  await expect(
    invoke({
      viewerId: 7,
      operation: 'status-bar.runtime-connect',
      environmentId: 'env-a',
      expectedHostId: 'runtime:env-a'
    })
  ).resolves.toMatchObject({ applied: true })
  fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
  await waitFor(() => expect(owners.disconnect).toHaveBeenCalledTimes(2))
  expect(owners.snapshots).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByRole('menuitem', { name: 'Manage Remote Hosts…' }))
  expect(useAppStore.getState().settingsNavigationTarget?.pane).toBe('servers')
  expect(useAppStore.getState().activeView).toBe('settings')
  useAppStore.setState({ activeView: 'terminal', settingsNavigationTarget: null })
  await expect(invoke({ viewerId: 7, operation: 'status-bar.manage' })).resolves.toMatchObject({
    applied: true,
    state: { statusBar: { settingsOpen: true } }
  })
  expect(owners.feature).toHaveBeenCalledWith('ssh')
})
it('waits for disclosure hydration and rejects wrong host/confirmation and deleted runtime before provider writes', async () => {
  render(<SshStatusSegment compact={false} iconOnly={false} />)
  await expect(
    invoke({ viewerId: 7, operation: 'status-bar.disclosure', open: true })
  ).resolves.toMatchObject({
    applied: true,
    state: { statusBar: { open: true } }
  })
  await expect(
    invoke({ viewerId: 7, operation: 'status-bar.disclosure', open: false })
  ).resolves.toMatchObject({
    applied: true,
    state: { statusBar: { open: false } }
  })
  await expect(
    invoke({
      viewerId: 7,
      operation: 'status-bar.runtime-connect',
      environmentId: 'env-a',
      expectedHostId: 'ssh:env-a'
    })
  ).rejects.toThrow('confirm_target_mismatch')
  await expect(
    invoke({
      viewerId: 7,
      operation: 'status-bar.runtime-disconnect',
      environmentId: 'env-a',
      expectedHostId: 'runtime:env-a',
      confirmTarget: 'wrong'
    })
  ).rejects.toThrow('confirm_target_mismatch')
  await act(async () => useAppStore.setState({ runtimeEnvironments: [] }))
  await expect(
    invoke({
      viewerId: 7,
      operation: 'status-bar.runtime-connect',
      environmentId: 'env-a',
      expectedHostId: 'runtime:env-a'
    })
  ).rejects.toThrow('connections_surface_unavailable')
  expect(owners.connect).not.toHaveBeenCalled()
  expect(owners.disconnect).not.toHaveBeenCalled()
})
it('refuses failed navigation, duplicate native/typed connect and late owner completion after unmount', async () => {
  let finish: ((value: unknown) => void) | undefined
  owners.connect.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const view = render(<SshStatusSegment compact={false} iconOnly={false} />)
  await invoke({ viewerId: 7, operation: 'status-bar.disclosure', open: true })
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
  await expect(
    invoke({
      viewerId: 7,
      operation: 'status-bar.runtime-connect',
      environmentId: 'env-a',
      expectedHostId: 'runtime:env-a'
    })
  ).resolves.toMatchObject({ applied: false })
  expect(owners.connect).toHaveBeenCalledOnce()
  view.unmount()
  await act(async () => finish?.({ ok: true, result: runtime }))
  expect(owners.repos).not.toHaveBeenCalled()
})
it('shares actual status bar visibility preference owner and checks persisted UI state privately', async () => {
  render(<Visibility />)
  fireEvent.click(screen.getByRole('button', { name: 'Visibility' }))
  const initial = useAppStore.getState().statusBarItems.includes('ssh')
  fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Remote Hosts' }))
  expect(useAppStore.getState().statusBarItems.includes('ssh')).toBe(!initial)
  expect(owners.feature).toHaveBeenCalledWith('ssh')
  expect(owners.set).toHaveBeenCalledOnce()
  await expect(
    invoke({ viewerId: 7, operation: 'status-bar.ssh-visible', value: initial })
  ).resolves.toMatchObject({
    applied: true,
    persisted: true,
    state: { statusBar: { sshVisible: initial } }
  })
  owners.get.mockRejectedValueOnce(new Error('private-readback-canary'))
  await expect(
    invoke({ viewerId: 7, operation: 'status-bar.ssh-visible', value: !initial })
  ).resolves.toMatchObject({ applied: true, persisted: false })
})
it('rejects expired/unmounted hydration and keeps a newer disclosure intent', async () => {
  let finish: (() => void) | undefined
  owners.hydrate.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      })
  )
  const view = render(<SshStatusSegment compact={false} iconOnly={false} />)
  const pending = invoke({ viewerId: 7, operation: 'status-bar.disclosure', open: true })
  void pending.catch(() => {})
  await waitFor(() => expect(owners.hydrate).toHaveBeenCalledOnce())
  await expect(
    invoke({ viewerId: 7, operation: 'status-bar.disclosure', open: false })
  ).resolves.toMatchObject({ applied: true })
  view.unmount()
  await act(async () => finish?.())
  await expect(pending).rejects.toThrow('connections_surface_unavailable')
})
it('does not treat empty or lost-contact snapshots as explicit disconnect confirmation', async () => {
  render(<SshStatusSegment compact={false} iconOnly={false} />)
  await invoke({
    viewerId: 7,
    operation: 'status-bar.runtime-connect',
    environmentId: 'env-a',
    expectedHostId: 'runtime:env-a'
  })
  owners.snapshots.mockImplementationOnce(async () =>
    useAppStore.getState().applyRuntimeHostStatusSnapshot({
      environmentId: 'env-a',
      pairingRevision: 1,
      sequence: ++sequence,
      checkedAt: Date.now(),
      status: runtime,
      verification: 'unavailable',
      transport: 'disconnected'
    })
  )
  await expect(
    invoke({
      viewerId: 7,
      operation: 'status-bar.runtime-disconnect',
      environmentId: 'env-a',
      expectedHostId: 'runtime:env-a',
      confirmTarget: 'env-a'
    })
  ).resolves.toMatchObject({
    applied: false,
    state: { statusBar: { runtimeState: 'reconnecting' } }
  })
  expect(owners.disconnect).toHaveBeenCalledOnce()
})
it.each([
  { operation: 'status-bar.disclosure', open: true },
  { operation: 'status-bar.manage' }
] as const)(
  'does not register an invisible empty hosts surface for $operation',
  async (command) => {
    useAppStore.setState({ runtimeEnvironments: [] })
    render(<SshStatusSegment compact={false} iconOnly={false} />)
    await expect(invoke({ viewerId: 7, ...command })).rejects.toThrow(
      'connections_surface_unavailable'
    )
    expect(owners.hydrate).not.toHaveBeenCalled()
    expect(owners.feature).not.toHaveBeenCalled()
    expect(useAppStore.getState().activeView).not.toBe('settings')
  }
)
