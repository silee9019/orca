import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { makePersistedUI } from '@/store/slices/ui-slice-test-harness'
import {
  bumpProviderRuntimeSessionGeneration,
  getProviderRuntimeContextKey
} from '@/lib/provider-runtime-context'
const fixture = vi.hoisted(() => {
  const settings: { activeRuntimeEnvironmentId: string | null } = {
    activeRuntimeEnvironmentId: null
  }
  return {
    state: {
      settings,
      persistedUIReady: true,
      agentsGroupBy: 'none',
      agentsReadFilter: 'all',
      agentsCompactMode: false,
      agentsShowChildAgents: true,
      setAgentsGroupBy: vi.fn(),
      setAgentsReadFilter: vi.fn(),
      setAgentsCompactMode: vi.fn(),
      setAgentsShowChildAgents: vi.fn()
    },
    visible: true,
    rows: true,
    committed: true
  }
})
vi.mock('@/store', () => ({ useAppStore: { getState: () => fixture.state } }))
vi.mock('./activity-viewer-view', () => ({
  readActivityViewerView: (surface: string) =>
    fixture.visible
      ? {
          surface,
          runtimeContextKey: getProviderRuntimeContextKey(fixture.state.settings),
          groupBy: fixture.committed ? fixture.state.agentsGroupBy : 'status',
          readFilter: fixture.state.agentsReadFilter,
          compact: fixture.state.agentsCompactMode,
          showChildAgents: fixture.state.agentsShowChildAgents,
          querySettled: true,
          densityMeasured: true,
          selectedPaneKey: null,
          logicalRows: fixture.rows
            ? [{ key: 't:one', kind: 'thread', hostId: 'local', workspaceId: 'one' }]
            : [],
          renderedRows: fixture.rows ? [{ key: 't:one', height: 118 }] : []
        }
      : null
}))
import { applyActivityViewerRequest } from './activity-viewer-bridge'
import type { ActivityViewerCommand } from '../../../shared/rpc-contract/activity-viewer-params'
const request = (command: ActivityViewerCommand) => ({
  id: 'r',
  expiresAt: Date.now() + 250,
  command
})
const base = { viewer: 'host', surface: 'activity-page' } as const
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(fixture.state, {
    settings: { activeRuntimeEnvironmentId: null },
    persistedUIReady: true,
    agentsGroupBy: 'none',
    agentsReadFilter: 'all',
    agentsCompactMode: false,
    agentsShowChildAgents: true
  })
  Object.assign(fixture, { visible: true, rows: true, committed: true })
  fixture.state.setAgentsGroupBy.mockImplementation(async (value) => {
    fixture.state.agentsGroupBy = value
  })
  fixture.state.setAgentsReadFilter.mockImplementation(async (value) => {
    fixture.state.agentsReadFilter = value
  })
  fixture.state.setAgentsCompactMode.mockImplementation(async (value) => {
    fixture.state.agentsCompactMode = value
  })
  fixture.state.setAgentsShowChildAgents.mockImplementation(async (value) => {
    fixture.state.agentsShowChildAgents = value
  })
  vi.stubGlobal('window', {
    api: {
      ui: {
        setWithAck: vi.fn(),
        get: vi.fn(async () => ({
          agentsGroupBy: fixture.state.agentsGroupBy,
          agentsReadFilter: fixture.state.agentsReadFilter,
          agentsCompactMode: fixture.state.agentsCompactMode,
          agentsShowChildAgents: fixture.state.agentsShowChildAgents
        }))
      }
    }
  })
})
it('awaits the existing parents without a second write', async () => {
  for (const command of [
    { ...base, operation: 'group', by: 'project' },
    { ...base, operation: 'read', filter: 'unread' },
    { ...base, operation: 'compact', enabled: true },
    { ...base, operation: 'children', enabled: false }
  ] as const) {
    expect(await applyActivityViewerRequest(request(command))).toMatchObject({
      applied: true,
      persisted: true,
      writeOutcome: 'accepted'
    })
  }
  expect(window.api.ui.setWithAck).not.toHaveBeenCalled()
})
it('keeps optimistic rows separate from parent rejection', async () => {
  fixture.state.setAgentsGroupBy.mockImplementationOnce(async (value) => {
    fixture.state.agentsGroupBy = value
    throw new Error('rejected')
  })
  expect(
    await applyActivityViewerRequest(request({ ...base, operation: 'group', by: 'project' }))
  ).toMatchObject({
    applied: true,
    persisted: false,
    writeOutcome: 'rejected',
    reason: 'persistence_failed'
  })
})
it('does not open absent surfaces or claim density on empty rows', async () => {
  fixture.visible = false
  expect(
    await applyActivityViewerRequest(request({ ...base, operation: 'read', filter: 'unread' }))
  ).toMatchObject({ applied: false, persisted: true, reason: 'activity_surface_unavailable' })
  fixture.visible = true
  fixture.rows = false
  expect(
    await applyActivityViewerRequest(request({ ...base, operation: 'compact', enabled: true }))
  ).toMatchObject({ applied: false, reason: 'activity_rows_unavailable' })
  expect(
    await applyActivityViewerRequest(request({ ...base, operation: 'group', by: 'none' }))
  ).toMatchObject({ applied: true })
})
it('fences a runtime session change during host readback', async () => {
  vi.spyOn(window.api.ui, 'get').mockImplementationOnce(async () => {
    bumpProviderRuntimeSessionGeneration()
    throw new Error('changed')
  })
  expect(await applyActivityViewerRequest(request({ ...base, operation: 'get' }))).toMatchObject({
    applied: false,
    persisted: null,
    reason: 'viewer_runtime_changed'
  })
})
it('keeps concurrent UI edits separate from accepted persistence', async () => {
  vi.spyOn(window.api.ui, 'get').mockImplementationOnce(async () => {
    fixture.state.agentsGroupBy = 'agent'
    return makePersistedUI({ agentsGroupBy: 'project' })
  })
  expect(
    await applyActivityViewerRequest(request({ ...base, operation: 'group', by: 'project' }))
  ).toMatchObject({ applied: false, persisted: true, reason: 'viewer_surface_superseded' })
})
it('bounds unsettled parents and host reads', async () => {
  vi.useFakeTimers()
  fixture.state.setAgentsGroupBy.mockImplementationOnce((value) => {
    fixture.state.agentsGroupBy = value
    return new Promise<void>(() => {})
  })
  vi.spyOn(window.api.ui, 'get').mockImplementationOnce(() => new Promise(() => {}))
  const pending = applyActivityViewerRequest(
    request({ ...base, operation: 'group', by: 'project' })
  )
  await vi.advanceTimersByTimeAsync(1000)
  expect(await pending).toMatchObject({ writeOutcome: 'unknown', persisted: null })
})
