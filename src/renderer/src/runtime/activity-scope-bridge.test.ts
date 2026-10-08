import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { makePersistedUI } from '@/store/slices/ui-slice-test-harness'
import { readActivityScope } from './activity-scope-preferences'
import { applyActivityViewerRequest } from './activity-viewer-bridge'
import type { ActivityViewerCommand } from '../../../shared/rpc-contract/activity-viewer-params'

const fixture = vi.hoisted(() => ({
  mounted: true,
  publishScope: true,
  state: {
    settings: { activeRuntimeEnvironmentId: null },
    persistedUIReady: true,
    agentsGroupBy: 'none',
    agentsReadFilter: 'all',
    agentsCompactMode: false,
    agentsShowChildAgents: true,
    agentsVisibleHostIds: null,
    agentsFilterRepoIds: [],
    agentsHideWorkspacesFromOtherDevices: false,
    agentsHideAutomationGeneratedWorkspaces: false,
    agentsHideCliCreatedWorkspaces: false,
    runtimeEnvironmentCatalogHydrated: true,
    runtimeEnvironments: [],
    runtimeStatusByEnvironmentId: new Map(),
    repos: [],
    sshTargetLabels: new Map([['fixture', 'Fixture']]),
    sshConnectionStates: new Map(),
    setAgentsVisibleHostIds: vi.fn(),
    setAgentsFilterRepoIds: vi.fn(),
    setAgentsHideWorkspacesFromOtherDevices: vi.fn(),
    setAgentsHideAutomationGeneratedWorkspaces: vi.fn(),
    setAgentsHideCliCreatedWorkspaces: vi.fn()
  }
}))
vi.mock('@/store', () => ({ useAppStore: { getState: () => fixture.state } }))
vi.mock('./activity-viewer-view', () => ({
  readActivityViewerView: (surface: string) =>
    fixture.mounted
      ? {
          surface,
          runtimeContextKey: getProviderRuntimeContextKey(fixture.state.settings),
          groupBy: 'none',
          readFilter: 'all',
          compact: false,
          showChildAgents: true,
          querySettled: true,
          query: '',
          densityMeasured: false,
          logicalRows: [],
          renderedRows: [],
          selectedPaneKey: null,
          ...(fixture.publishScope ? { scope: readActivityScope(fixture.state) } : {})
        }
      : null
}))
const ui = () =>
  makePersistedUI({
    agentsVisibleHostIds: fixture.state.agentsVisibleHostIds,
    agentsFilterRepoIds: fixture.state.agentsFilterRepoIds,
    agentsHideWorkspacesFromOtherDevices: fixture.state.agentsHideWorkspacesFromOtherDevices,
    agentsHideAutomationGeneratedWorkspaces: fixture.state.agentsHideAutomationGeneratedWorkspaces,
    agentsHideCliCreatedWorkspaces: fixture.state.agentsHideCliCreatedWorkspaces
  })
const target = { viewer: 'host', surface: 'activity-page' } as const
const run = (command: ActivityViewerCommand) =>
  applyActivityViewerRequest({ id: 'scope', expiresAt: Date.now() + 150, command })
beforeEach(() => {
  vi.clearAllMocks()
  fixture.publishScope = true
  fixture.mounted = true
  Object.assign(fixture.state, {
    agentsVisibleHostIds: null,
    agentsFilterRepoIds: [],
    agentsHideWorkspacesFromOtherDevices: false,
    agentsHideAutomationGeneratedWorkspaces: false,
    agentsHideCliCreatedWorkspaces: false,
    runtimeEnvironmentCatalogHydrated: true,
    runtimeEnvironments: []
  })
  fixture.state.setAgentsVisibleHostIds.mockImplementation(async (ids) => {
    Object.assign(fixture.state, { agentsVisibleHostIds: ids })
  })
  fixture.state.setAgentsFilterRepoIds.mockImplementation(async (ids) => {
    Object.assign(fixture.state, { agentsFilterRepoIds: ids })
  })
  fixture.state.setAgentsHideWorkspacesFromOtherDevices.mockImplementation(async (hidden) => {
    fixture.state.agentsHideWorkspacesFromOtherDevices = hidden
  })
  fixture.state.setAgentsHideAutomationGeneratedWorkspaces.mockImplementation(async (hidden) => {
    fixture.state.agentsHideAutomationGeneratedWorkspaces = hidden
  })
  fixture.state.setAgentsHideCliCreatedWorkspaces.mockImplementation(async (hidden) => {
    fixture.state.agentsHideCliCreatedWorkspaces = hidden
  })
  vi.stubGlobal('window', { api: { ui: { setWithAck: vi.fn(), get: vi.fn(async () => ui()) } } })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
it('rejects an unmounted surface before any scope parent writes', async () => {
  fixture.mounted = false
  Object.assign(fixture.state, { agentsVisibleHostIds: ['local'] })
  for (const command of [
    { ...target, operation: 'origin', kind: 'cli', hidden: true },
    { ...target, operation: 'scope-reset' },
    { ...target, operation: 'host-toggle', host: 'ssh:fixture' },
    { ...target, operation: 'hosts-toggle-all' }
  ] as const) {
    await expect(run(command)).rejects.toThrow('activity_surface_unavailable')
  }
  expect(fixture.state.setAgentsVisibleHostIds).not.toHaveBeenCalled()
  expect(fixture.state.setAgentsFilterRepoIds).not.toHaveBeenCalled()
  expect(fixture.state.setAgentsHideCliCreatedWorkspaces).not.toHaveBeenCalled()
})
it('uses the original origin parents and the existing other-client availability gate', async () => {
  for (const kind of ['cli', 'automation'] as const) {
    expect(await run({ ...target, operation: 'origin', kind, hidden: true })).toMatchObject({
      applied: true,
      persisted: true,
      writeOutcome: 'accepted'
    })
  }
  await expect(
    run({ ...target, operation: 'origin', kind: 'other-client', hidden: true })
  ).rejects.toThrow('activity_origin_filter_unavailable')
  expect(fixture.state.setAgentsHideWorkspacesFromOtherDevices).not.toHaveBeenCalled()
  fixture.state.runtimeEnvironmentCatalogHydrated = false
  expect(
    await run({ ...target, operation: 'origin', kind: 'other-client', hidden: true })
  ).toMatchObject({ applied: true, persisted: true })
  expect(fixture.state.setAgentsHideCliCreatedWorkspaces).toHaveBeenCalledExactlyOnceWith(true)
  expect(fixture.state.setAgentsHideAutomationGeneratedWorkspaces).toHaveBeenCalledExactlyOnceWith(
    true
  )
  expect(window.api.ui.setWithAck).not.toHaveBeenCalled()
})
it('preserves host toggles and the last-host no-op without writing workspace-nav scope', async () => {
  expect(await run({ ...target, operation: 'host-toggle', host: 'ssh:fixture' })).toMatchObject({
    applied: true,
    persisted: true,
    dispatched: true
  })
  expect(fixture.state.agentsVisibleHostIds).toEqual(['ssh:fixture'])
  expect(await run({ ...target, operation: 'host-toggle', host: 'ssh:fixture' })).toMatchObject({
    applied: true,
    dispatched: false,
    writeOutcome: 'not_requested'
  })
  expect(fixture.state.setAgentsVisibleHostIds).toHaveBeenCalledTimes(1)
  expect(await run({ ...target, operation: 'hosts-toggle-all' })).toMatchObject({
    applied: true,
    persistedScope: { visibleHostIds: null }
  })
  expect(await run({ ...target, operation: 'hosts-toggle-all' })).toMatchObject({
    applied: true,
    persistedScope: { visibleHostIds: ['local'] }
  })
  await expect(run({ ...target, operation: 'host-toggle', host: 'ssh:missing' })).rejects.toThrow(
    'activity_host_unavailable'
  )
  expect(fixture.state.setAgentsVisibleHostIds).toHaveBeenCalledTimes(3)
})
it('keeps both reset parents once and preserves origins while separating a partial rejection', async () => {
  Object.assign(fixture.state, {
    agentsVisibleHostIds: ['ssh:fixture'],
    agentsFilterRepoIds: ['project'],
    agentsHideCliCreatedWorkspaces: true
  })
  fixture.state.setAgentsVisibleHostIds.mockImplementationOnce(async (ids) => {
    Object.assign(fixture.state, { agentsVisibleHostIds: ids })
    throw new Error('rejected')
  })
  expect(await run({ ...target, operation: 'scope-reset' })).toMatchObject({
    applied: true,
    persisted: false,
    writeOutcome: 'rejected',
    reason: 'persistence_failed',
    persistedScope: { visibleHostIds: null, filterRepoIds: [], hideCli: true }
  })
  expect(fixture.state.setAgentsVisibleHostIds).toHaveBeenCalledExactlyOnceWith(null)
  expect(fixture.state.setAgentsFilterRepoIds).toHaveBeenCalledExactlyOnceWith([])
  expect(fixture.state.setAgentsHideCliCreatedWorkspaces).not.toHaveBeenCalled()
  expect(await run({ ...target, operation: 'scope-reset' })).toMatchObject({
    dispatched: false,
    writeOutcome: 'not_requested'
  })
})
it('requires the committed scope publication before claiming the list applied', async () => {
  vi.useFakeTimers()
  fixture.publishScope = false
  const pending = run({ ...target, operation: 'origin', kind: 'cli', hidden: true })
  await vi.advanceTimersByTimeAsync(200)
  expect(await pending).toMatchObject({
    applied: false,
    persisted: true,
    reason: 'viewer_not_applied'
  })
})
it('does not overwrite a newer local origin edit during readback', async () => {
  vi.spyOn(window.api.ui, 'get').mockImplementationOnce(async () => {
    const accepted = ui()
    fixture.state.agentsHideCliCreatedWorkspaces = false
    return accepted
  })
  expect(await run({ ...target, operation: 'origin', kind: 'cli', hidden: true })).toMatchObject({
    applied: false,
    persisted: true,
    reason: 'viewer_surface_superseded'
  })
  expect(fixture.state.agentsHideCliCreatedWorkspaces).toBe(false)
})
it('keeps an unsettled reset parent unknown and missing readback unverifiable', async () => {
  vi.useFakeTimers()
  Object.assign(fixture.state, {
    agentsVisibleHostIds: ['local'],
    agentsFilterRepoIds: ['project']
  })
  fixture.state.setAgentsFilterRepoIds.mockImplementationOnce(() => new Promise<void>(() => {}))
  vi.spyOn(window.api.ui, 'get').mockImplementationOnce(() => new Promise(() => {}))
  const pending = run({ ...target, operation: 'scope-reset' })
  await vi.advanceTimersByTimeAsync(300)
  expect(await pending).toMatchObject({
    writeOutcome: 'unknown',
    persisted: null,
    persistedScope: null
  })
})
