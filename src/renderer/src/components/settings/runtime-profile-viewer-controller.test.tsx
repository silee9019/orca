import '@testing-library/jest-dom/vitest'
import { createGlobalSettingsFixture } from '../../../../shared/global-settings-test-fixture'
// @vitest-environment happy-dom
import { useState, type ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { RuntimeEnvironmentsPane } from './RuntimeEnvironmentsPane'
import { applyRuntimeConnectionsViewerRequest } from '@/runtime/runtime-connections-viewer-controller'
import { useAppStore } from '@/store'
import type { ConnectionsViewerCommand } from '../../../../shared/rpc-contract/connections-viewer-params'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
vi.mock('./use-runtime-environment-catalog', () => ({
  useRuntimeEnvironmentCatalog: () => ({
    environments: [{ id: 'server-a', name: 'Server A', endpoints: [] }],
    isLoading: false,
    detailsByEnvironmentId: {},
    setDetailsByEnvironmentId: vi.fn(),
    mountedRef: { current: true },
    loadEnvironments: vi.fn()
  })
}))
vi.mock('./SearchableSetting', () => ({
  SearchableSetting: ({ children }: { children: ReactNode }) => <>{children}</>
}))
vi.mock('./CloudVmSetupGuide', () => ({ CloudVmSetupGuide: () => null }))
vi.mock('./EphemeralVmRuntimesSection', () => ({ EphemeralVmRuntimesSection: () => null }))
vi.mock('./RuntimePairingUrlGenerator', () => ({ RuntimePairingUrlGenerator: () => null }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
const profile: { id: string | null; otherViewerId: string | null; calls: number; accept: boolean } =
  {
    id: null,
    otherViewerId: null,
    calls: 0,
    accept: true
  }
function Fixture() {
  const [settings, setSettings] = useState<GlobalSettings>(
    createGlobalSettingsFixture({ activeRuntimeEnvironmentId: null })
  )
  const selectProfile = async (id: string | null): Promise<boolean> => {
    profile.calls += 1
    if (!profile.accept) {
      return false
    }
    profile.id = id
    profile.otherViewerId = id
    setSettings((current) => ({ ...current, activeRuntimeEnvironmentId: id }))
    return true
  }
  return (
    <RuntimeEnvironmentsPane
      settings={settings}
      setActiveRuntimeEnvironmentPreference={selectProfile}
      setProfileRuntimeEnvironmentPreference={selectProfile}
      selectRuntimeEnvironmentForViewer={async (id) => {
        setSettings((current) => ({ ...current, activeRuntimeEnvironmentId: id }))
        return true
      }}
    />
  )
}
beforeEach(() => {
  profile.id = null
  profile.otherViewerId = null
  profile.calls = 0
  profile.accept = true
  useAppStore.setState({ refreshRemoteServerUpdates: vi.fn().mockResolvedValue(undefined) })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { settings: { get: async () => ({ activeRuntimeEnvironmentId: profile.id }) } }
  })
})
afterEach(() => {
  cleanup()
  useAppStore.setState(useAppStore.getInitialState(), true)
})
async function invoke(command: ConnectionsViewerCommand) {
  let applying
  await act(async () => {
    applying = applyRuntimeConnectionsViewerRequest({
      id: 'profile-fixture',
      expiresAt: Date.now() + 500,
      command
    })
    void applying.catch(() => {})
  })
  return applying
}
it('keeps viewer selection separate from an exact confirmed profile preference write', async () => {
  render(<Fixture />)
  expect(
    await invoke({ viewerId: 7, operation: 'runtime.use', environmentId: 'server-a' })
  ).toMatchObject({ applied: true, persisted: null })
  expect(profile.id).toBeNull()
  expect(profile.otherViewerId).toBeNull()
  expect(profile.calls).toBe(0)
  await expect(
    invoke({
      viewerId: 7,
      operation: 'runtime.profile-use',
      environmentId: 'server-a',
      confirmTarget: 'wrong'
    })
  ).rejects.toThrow('confirm_target_mismatch')
  expect(profile.calls).toBe(0)
  expect(
    await invoke({
      viewerId: 7,
      operation: 'runtime.profile-use',
      environmentId: 'server-a',
      confirmTarget: 'server-a'
    })
  ).toMatchObject({ applied: true, persisted: true })
  expect(profile.id).toBe('server-a')
  expect(profile.otherViewerId).toBe('server-a')
  expect(profile.calls).toBe(1)
})
it('requests the actual switch dialog and confirms or cancels its pending target', async () => {
  render(<Fixture />)
  expect(
    await invoke({ viewerId: 7, operation: 'runtime.switch-request', environmentId: 'server-a' })
  ).toMatchObject({ applied: true, persisted: null, state: { pendingSwitchValue: 'server-a' } })
  expect(screen.getByRole('dialog')).toBeDefined()
  expect(profile.calls).toBe(0)
  expect(await invoke({ viewerId: 7, operation: 'runtime.switch-cancel' })).toMatchObject({
    applied: true,
    state: { pendingSwitchValue: null }
  })
  expect(profile.calls).toBe(0)
  await invoke({ viewerId: 7, operation: 'runtime.switch-request', environmentId: 'server-a' })
  expect(
    await invoke({ viewerId: 7, operation: 'runtime.switch-confirm', confirmTarget: 'server-a' })
  ).toMatchObject({
    applied: true,
    persisted: true,
    state: { pendingSwitchValue: null, environmentId: 'server-a' }
  })
  expect(profile.calls).toBe(1)
})
it('retains the confirmation dialog when the profile owner refuses switching', async () => {
  render(<Fixture />)
  await invoke({ viewerId: 7, operation: 'runtime.switch-request', environmentId: 'server-a' })
  profile.accept = false
  expect(
    await invoke({ viewerId: 7, operation: 'runtime.switch-confirm', confirmTarget: 'server-a' })
  ).toMatchObject({
    applied: false,
    persisted: false,
    state: { pendingSwitchValue: 'server-a', environmentId: null }
  })
  expect(screen.getByRole('dialog')).toBeDefined()
})

it('uses the real form, mutation hook, workflow and section controls for typed and native viewer drafts', async () => {
  render(<Fixture />)
  fireEvent.click(screen.getByRole('button', { name: 'Add Server' }))
  expect(await invoke({ viewerId: 7, operation: 'runtime.get' })).toMatchObject({
    state: { addFormOpen: true }
  })
  fireEvent.change(screen.getByLabelText('Name in Orca'), { target: { value: 'native-name' } })
  expect(await invoke({ viewerId: 7, operation: 'runtime.get' })).toMatchObject({
    state: { name: 'native-name' }
  })
  expect(
    await invoke({ viewerId: 7, operation: 'runtime.draft-name', value: 'typed-name' })
  ).toMatchObject({ applied: true })
  expect(screen.getByLabelText('Name in Orca')).toHaveProperty('value', 'typed-name')
  fireEvent.change(screen.getByLabelText('Access link'), {
    target: { value: 'native-secret-canary' }
  })
  expect(await invoke({ viewerId: 7, operation: 'runtime.get' })).toMatchObject({
    state: { pairingCodeSet: true }
  })
  const drafted = await invoke({
    viewerId: 7,
    operation: 'runtime.draft-pairing',
    value: 'typed-secret-canary'
  })
  expect(drafted.applied).toBe(true)
  expect(JSON.stringify(drafted)).not.toContain('typed-secret-canary')
  expect(screen.getByLabelText('Access link')).toHaveProperty('value', 'typed-secret-canary')
  expect(await invoke({ viewerId: 7, operation: 'runtime.cancel-add' })).toMatchObject({
    applied: true,
    state: { addFormOpen: false, name: '', pairingCodeSet: false }
  })
  await invoke({ viewerId: 7, operation: 'runtime.add-form', open: true })
  fireEvent.change(screen.getByLabelText('Name in Orca'), { target: { value: 'discard' } })
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(await invoke({ viewerId: 7, operation: 'runtime.get' })).toMatchObject({
    state: { addFormOpen: false, name: '', pairingCodeSet: false }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Advanced' }))
  expect(await invoke({ viewerId: 7, operation: 'runtime.get' })).toMatchObject({
    state: { advancedOpen: true }
  })
  expect(await invoke({ viewerId: 7, operation: 'runtime.advanced', open: false })).toMatchObject({
    applied: true
  })
  expect(screen.getByRole('button', { name: 'Advanced' })).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(screen.getByRole('button', { name: /Share this host/ }))
  expect(await invoke({ viewerId: 7, operation: 'runtime.get' })).toMatchObject({
    state: { workflow: 'share' }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Hide Form' }))
  expect(await invoke({ viewerId: 7, operation: 'runtime.get' })).toMatchObject({
    state: { shareFormOpen: false }
  })
  expect(await invoke({ viewerId: 7, operation: 'runtime.share-form', open: true })).toMatchObject({
    applied: true
  })
  expect(screen.getByRole('button', { name: 'Hide Form' })).toBeDefined()
  expect(
    await invoke({ viewerId: 7, operation: 'runtime.workflow', value: 'connect' })
  ).toMatchObject({ applied: true, state: { workflow: 'connect' } })
  expect(profile.calls).toBe(0)
})
