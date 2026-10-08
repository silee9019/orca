// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { RuntimeEnvironmentsPane } from './RuntimeEnvironmentsPane'
import { createGlobalSettingsFixture } from '../../../../shared/global-settings-test-fixture'
import { encodePairingOffer } from '../../../../shared/pairing'
import { RUNTIME_PROTOCOL_VERSION } from '../../../../shared/protocol-version'
import { TooltipProvider } from '../ui/tooltip'
import { applyRuntimeServerViewerRequest } from '@/runtime/runtime-server-viewer'
import type { ConnectionsViewerCommand } from '../../../../shared/rpc-contract/connections-viewer-params'
import type { PublicKnownRuntimeEnvironment } from '../../../../shared/runtime-environments'
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('./CloudVmSetupGuide', () => ({ CloudVmSetupGuide: () => null }))
vi.mock('./EphemeralVmRuntimesSection', () => ({ EphemeralVmRuntimesSection: () => null }))
const server: PublicKnownRuntimeEnvironment = {
  id: 'server-a',
  name: 'Server A',
  createdAt: 1,
  updatedAt: 1,
  lastUsedAt: null,
  runtimeId: 'runtime-a',
  preferredEndpointId: 'ws-a',
  endpoints: [{ id: 'ws-a', kind: 'websocket', label: 'fixture', endpoint: 'ws://192.0.2.1:6768' }]
}
const status = {
  runtimeId: 'runtime-a',
  rendererGraphEpoch: 1,
  graphStatus: 'ready',
  authoritativeWindowId: 1,
  liveTabCount: 0,
  liveLeafCount: 0,
  runtimeProtocolVersion: RUNTIME_PROTOCOL_VERSION
}
const code = encodePairingOffer({
  v: 2,
  endpoint: 'ws://192.0.2.2:6768',
  deviceToken: 'private-token',
  publicKeyB64: 'private-key'
})
let saved: PublicKnownRuntimeEnvironment[]
const list = vi.fn(),
  connect = vi.fn(),
  disconnect = vi.fn(),
  remove = vi.fn(),
  add = vi.fn()
beforeEach(() => {
  saved = [server]
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({
    settings: createGlobalSettingsFixture(),
    refreshRemoteServerUpdates: vi.fn().mockResolvedValue(undefined),
    readRuntimeHostStatusSnapshots: vi.fn().mockResolvedValue(undefined),
    fetchRuntimeEnvironmentRepos: vi.fn().mockResolvedValue([]),
    fetchWorktreeLineage: vi.fn().mockResolvedValue(undefined)
  })
  list.mockReset().mockImplementation(async () => [...saved])
  connect.mockReset().mockResolvedValue({ ok: true, result: status })
  disconnect.mockReset().mockResolvedValue(undefined)
  remove.mockReset().mockImplementation(async () => {
    saved = []
  })
  add.mockReset().mockImplementation(async (input: { name: string }) => {
    saved = [{ ...server, id: 'server-b', name: input.name }]
    return { ok: true, environment: saved[0], runtimeStatus: status }
  })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      runtimeEnvironments: {
        list,
        getStatus: vi.fn().mockRejectedValue(new Error('offline')),
        connect,
        disconnect,
        remove,
        verifyAndAddFromPairingCode: add
      }
    }
  })
})
afterEach(() => {
  cleanup()
  useAppStore.setState(useAppStore.getInitialState(), true)
})
async function invoke(command: ConnectionsViewerCommand) {
  let pending!: ReturnType<typeof applyRuntimeServerViewerRequest>
  await act(async () => {
    pending = applyRuntimeServerViewerRequest({
      id: 'server-proof',
      expiresAt: Date.now() + 600,
      command
    })
    void pending.catch(() => {})
  })
  let done = false
  void pending
    .finally(() => {
      done = true
    })
    .catch(() => {})
  while (!done) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
  }
  return pending
}
async function mount(active: string | null = null) {
  const view = render(
    <TooltipProvider>
      <RuntimeEnvironmentsPane
        settings={createGlobalSettingsFixture({ activeRuntimeEnvironmentId: active })}
        setActiveRuntimeEnvironmentPreference={vi.fn().mockResolvedValue(true)}
      />
    </TooltipProvider>
  )
  await waitFor(() => expect(screen.getByRole('button', { name: 'Connect' })).toBeEnabled())
  return view
}
it('uses the real removal dialog for native cancel/Escape and typed exact confirmation', async () => {
  await mount()
  fireEvent.click(screen.getByRole('button', { name: /Remove .*Server A/ }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(await invoke({ operation: 'runtime-server.get', viewerId: 7 })).toMatchObject({
    state: { pendingRemoveId: null }
  })
  await invoke({ operation: 'runtime-server.remove-open', viewerId: 7, environmentId: 'server-a' })
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  await invoke({ operation: 'runtime-server.remove-open', viewerId: 7, environmentId: 'server-a' })
  await expect(
    invoke({ operation: 'runtime-server.remove-confirm', viewerId: 7, confirmTarget: 'wrong' })
  ).rejects.toThrow('confirm_target_mismatch')
  expect(remove).not.toHaveBeenCalled()
  expect(
    await invoke({
      operation: 'runtime-server.remove-confirm',
      viewerId: 7,
      confirmTarget: 'server-a'
    })
  ).toMatchObject({ applied: true, state: { pendingRemoveId: null, environmentCount: 0 } })
  expect(remove).toHaveBeenCalledWith({ selector: 'server-a' })
  saved = [server]
  await invoke({ operation: 'runtime-server.refresh', viewerId: 7 })
  await invoke({ operation: 'runtime-server.remove-open', viewerId: 7, environmentId: 'server-a' })
  fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(remove).toHaveBeenCalledTimes(2)
})
it('retains the pending active server and clears removal errors on cancellation', async () => {
  await mount('server-a')
  await invoke({ operation: 'runtime-server.remove-open', viewerId: 7, environmentId: 'server-a' })
  expect(
    await invoke({
      operation: 'runtime-server.remove-confirm',
      viewerId: 7,
      confirmTarget: 'server-a'
    })
  ).toMatchObject({ applied: false, state: { pendingRemoveId: 'server-a', removeErrorSet: true } })
  expect(remove).not.toHaveBeenCalled()
  expect(await invoke({ operation: 'runtime-server.remove-cancel', viewerId: 7 })).toMatchObject({
    applied: true,
    state: { pendingRemoveId: null, removeErrorSet: false }
  })
})
it('reuses connect/disconnect providers and refresh canonical catalog without changing active server', async () => {
  await mount()
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Disconnect' })).toBeEnabled())
  expect(
    await invoke({ operation: 'runtime-server.disconnect', viewerId: 7, environmentId: 'server-a' })
  ).toMatchObject({ applied: true })
  expect(
    await invoke({ operation: 'runtime-server.connect', viewerId: 7, environmentId: 'server-a' })
  ).toMatchObject({ applied: true })
  fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
  await waitFor(() => expect(disconnect).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Connect' })).toBeEnabled())
  expect(await invoke({ operation: 'runtime-server.refresh', viewerId: 7 })).toMatchObject({
    applied: true,
    state: { environmentCount: 1 }
  })
  expect(useAppStore.getState().settings?.activeRuntimeEnvironmentId).toBeNull()
})
it('submits only the exact current private form values and confirms actual form closure', async () => {
  await mount()
  fireEvent.click(screen.getByRole('button', { name: 'Add Server' }))
  fireEvent.change(screen.getByLabelText('Name in Orca'), { target: { value: 'Server B' } })
  fireEvent.change(screen.getByLabelText('Access link'), { target: { value: code } })
  expect(
    await invoke({
      operation: 'runtime-server.add',
      viewerId: 7,
      name: 'wrong',
      pairingCode: code,
      allowLoopback: false
    })
  ).toMatchObject({ applied: false })
  expect(add).not.toHaveBeenCalled()
  expect(
    await invoke({
      operation: 'runtime-server.add',
      viewerId: 7,
      name: 'Server B',
      pairingCode: code,
      allowLoopback: false
    })
  ).toMatchObject({ applied: true, state: { addFormOpen: false } })
  expect(add).toHaveBeenCalledWith({ name: 'Server B', pairingCode: code, allowLoopback: false })
  fireEvent.click(screen.getByRole('button', { name: 'Add Server' }))
  fireEvent.change(screen.getByLabelText('Name in Orca'), { target: { value: 'Server C' } })
  fireEvent.change(screen.getByLabelText('Access link'), { target: { value: code } })
  fireEvent.click(screen.getByRole('button', { name: 'Add host' }))
  await waitFor(() => expect(screen.queryByLabelText('Access link')).not.toBeInTheDocument())
  expect(add).toHaveBeenLastCalledWith({
    name: 'Server C',
    pairingCode: code,
    allowLoopback: false
  })
  expect(
    await invoke({ operation: 'runtime-server.updates', viewerId: 7, open: true })
  ).toMatchObject({ applied: true, state: { updatesOpen: true } })
})

it('rejects malformed or unapproved loopback links and does not acknowledge ignored removal', async () => {
  await mount()
  fireEvent.click(screen.getByRole('button', { name: 'Add Server' }))
  fireEvent.change(screen.getByLabelText('Name in Orca'), { target: { value: 'Server B' } })
  fireEvent.change(screen.getByLabelText('Access link'), {
    target: { value: 'invalid-private-code' }
  })
  expect(
    await invoke({
      operation: 'runtime-server.add',
      viewerId: 7,
      name: 'Server B',
      pairingCode: 'invalid-private-code',
      allowLoopback: false
    })
  ).toMatchObject({ applied: false })
  const loopback = encodePairingOffer({
    v: 2,
    endpoint: 'ws://127.0.0.1:6768',
    deviceToken: 'private-token',
    publicKeyB64: 'private-key'
  })
  fireEvent.change(screen.getByLabelText('Access link'), { target: { value: loopback } })
  expect(
    await invoke({
      operation: 'runtime-server.add',
      viewerId: 7,
      name: 'Server B',
      pairingCode: loopback,
      allowLoopback: false
    })
  ).toMatchObject({ applied: false })
  expect(add).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  remove.mockResolvedValue(undefined)
  await invoke({ operation: 'runtime-server.remove-open', viewerId: 7, environmentId: 'server-a' })
  expect(
    await invoke({
      operation: 'runtime-server.remove-confirm',
      viewerId: 7,
      confirmTarget: 'server-a'
    })
  ).toMatchObject({ applied: false, state: { pendingRemoveId: 'server-a', removeErrorSet: true } })
  expect(saved).toHaveLength(1)
})
