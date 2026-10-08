import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  getProviderRuntimeContextKey,
  bumpProviderRuntimeSessionGeneration
} from '@/lib/provider-runtime-context'
import { makePersistedUI } from '@/store/slices/ui-slice-test-harness'
const fixture = vi.hoisted(() => {
  const settings: { activeRuntimeEnvironmentId: string | null } = {
    activeRuntimeEnvironmentId: null
  }
  const noControl = (): { toggle: (key: string) => void } | null => null
  const noRuntimeKey = (): string | null => null
  return {
    state: {
      settings,
      persistedUIReady: true,
      groupBy: 'repo',
      sortBy: 'recent',
      projectOrderBy: 'manual',
      collapsedGroups: new Set(['repo:one']),
      persistedUIWriteBaseline: { sortBy: 'recent', projectOrderBy: 'manual' },
      persistedUIWriteInFlightCounts: {},
      setGroupBy: vi.fn(),
      setSortBy: vi.fn(),
      setProjectOrderBy: vi.fn()
    },
    rendered: true,
    empty: false,
    viewRuntimeContextKey: noRuntimeKey(),
    committed: 'repo',
    durableGroup: 'repo',
    durableCollapsed: ['repo:one'],
    durableSort: 'recent',
    control: noControl()
  }
})
vi.mock('@/store', () => ({ useAppStore: { getState: () => fixture.state } }))
vi.mock('./workspace-list-viewer-view', () => ({
  readWorkspaceListCollapseControl: () => fixture.control,
  readWorkspaceListViewerView: () =>
    fixture.rendered
      ? {
          groupBy: fixture.committed,
          sortBy: fixture.state.sortBy,
          projectOrderBy: fixture.state.projectOrderBy,
          collapsedGroups: [...fixture.state.collapsedGroups],
          collapsibleKeys: ['repo:one', 'repo:two'],
          runtimeContextKey:
            fixture.viewRuntimeContextKey ?? getProviderRuntimeContextKey(fixture.state.settings),
          empty: fixture.empty,
          rows: [{ type: 'item', key: 'host-qualified-row', hostId: null }]
        }
      : null
}))
import { applyWorkspaceListViewerRequest } from './workspace-list-viewer-bridge'
import type { WorkspaceListViewerCommand } from '../../../shared/rpc-contract/workspace-list-viewer-params'
const request = (command: WorkspaceListViewerCommand) => ({
  id: 'r',
  expiresAt: Date.now() + 250,
  command
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(fixture.state, {
    settings: { activeRuntimeEnvironmentId: null },
    persistedUIReady: true,
    groupBy: 'repo',
    sortBy: 'recent',
    projectOrderBy: 'manual',
    collapsedGroups: new Set(['repo:one']),
    persistedUIWriteBaseline: { sortBy: 'recent', projectOrderBy: 'manual' }
  })
  Object.assign(fixture, {
    rendered: true,
    empty: false,
    viewRuntimeContextKey: null,
    committed: 'repo',
    durableGroup: 'repo',
    durableCollapsed: ['repo:one'],
    durableSort: 'recent',
    control: {
      toggle: vi.fn((key: string) => {
        const next = new Set(fixture.state.collapsedGroups)
        if (!next.delete(key)) {
          next.add(key)
        }
        fixture.state.collapsedGroups = next
        fixture.durableCollapsed = [...next]
      })
    }
  })
  fixture.state.setGroupBy.mockImplementation(async (by) => {
    fixture.state.groupBy = by
    fixture.state.collapsedGroups = new Set()
    fixture.committed = by
    fixture.durableGroup = by
    fixture.durableCollapsed = []
  })
  fixture.state.setSortBy.mockImplementation((by) => {
    fixture.state.sortBy = by
    fixture.state.persistedUIWriteBaseline.sortBy = by
    fixture.durableSort = by
  })
  fixture.state.setProjectOrderBy.mockImplementation((by) => {
    fixture.state.projectOrderBy = by
    fixture.state.persistedUIWriteBaseline.projectOrderBy = by
  })
  vi.stubGlobal('window', {
    api: {
      ui: {
        setWithAck: vi.fn(),
        set: vi.fn(),
        get: vi.fn(async () => ({
          groupBy: fixture.durableGroup,
          collapsedGroups: fixture.durableCollapsed,
          sortBy: fixture.durableSort,
          projectOrderBy: fixture.state.projectOrderBy
        }))
      }
    }
  })
})
it('keeps same-mode collapse reset and awaits the original grouping parent', async () => {
  expect(
    await applyWorkspaceListViewerRequest(
      request({ viewer: 'host', operation: 'group', by: 'repo' })
    )
  ).toMatchObject({ applied: true, persisted: true, writeOutcome: 'accepted', collapsedGroups: [] })
  expect(fixture.state.setGroupBy).toHaveBeenCalledTimes(1)
  expect(window.api.ui.setWithAck).not.toHaveBeenCalled()
})
it('checks the host collapse reset, not only the grouping value', async () => {
  fixture.state.setGroupBy.mockImplementationOnce(async () => {
    fixture.state.collapsedGroups.clear()
  })
  expect(
    await applyWorkspaceListViewerRequest(
      request({ viewer: 'host', operation: 'group', by: 'repo' })
    )
  ).toMatchObject({ persisted: false })
})
it('observes existing sort persistence without claiming its write Promise or metadata', async () => {
  expect(
    await applyWorkspaceListViewerRequest(
      request({ viewer: 'host', operation: 'sort', by: 'name' })
    )
  ).toMatchObject({
    applied: true,
    persisted: true,
    writeOutcome: 'unknown',
    metadataPersisted: null
  })
  expect(window.api.ui.setWithAck).not.toHaveBeenCalled()
  expect(window.api.ui.set).not.toHaveBeenCalled()
})
it('keeps failed grouping distinct from a visible optimistic effect', async () => {
  fixture.state.setGroupBy.mockImplementationOnce(async (by) => {
    fixture.state.groupBy = by
    fixture.committed = by
    fixture.state.collapsedGroups.clear()
    throw new Error('rejected')
  })
  expect(
    await applyWorkspaceListViewerRequest(
      request({ viewer: 'host', operation: 'group', by: 'none' })
    )
  ).toMatchObject({
    applied: true,
    persisted: false,
    writeOutcome: 'rejected',
    reason: 'persistence_failed'
  })
})
it('does not read another runtime after the parent', async () => {
  fixture.state.setGroupBy.mockImplementationOnce(async () => {
    fixture.state.settings.activeRuntimeEnvironmentId = 'other'
  })
  expect(
    await applyWorkspaceListViewerRequest(
      request({ viewer: 'host', operation: 'group', by: 'none' })
    )
  ).toMatchObject({ applied: false, persisted: null, reason: 'viewer_runtime_changed' })
  expect(window.api.ui.get).not.toHaveBeenCalled()
})
it('retains project order menu availability', async () => {
  fixture.state.groupBy = 'none'
  await expect(
    applyWorkspaceListViewerRequest(
      request({ viewer: 'host', operation: 'project-order', by: 'recent' })
    )
  ).rejects.toThrow('project_order_unavailable')
  expect(fixture.state.setProjectOrderBy).not.toHaveBeenCalled()
})
it('does not call missing or stale committed rows applied', async () => {
  fixture.rendered = false
  expect(
    await applyWorkspaceListViewerRequest(
      request({ viewer: 'host', operation: 'sort', by: 'name' })
    )
  ).toMatchObject({ applied: false, persisted: true, reason: 'workspace_list_unavailable' })
  fixture.rendered = true
  fixture.committed = 'repo'
  fixture.state.setGroupBy.mockImplementationOnce(async (by) => {
    fixture.state.groupBy = by
    fixture.state.collapsedGroups.clear()
    fixture.durableGroup = by
    fixture.durableCollapsed = []
  })
  expect(
    await applyWorkspaceListViewerRequest(
      request({ viewer: 'host', operation: 'group', by: 'none' })
    )
  ).toMatchObject({ applied: false, persisted: true, reason: 'viewer_not_applied' })
})
it('keeps unreadable host state unverifiable', async () => {
  vi.spyOn(window.api.ui, 'get').mockRejectedValueOnce(new Error('offline'))
  expect(
    await applyWorkspaceListViewerRequest(
      request({ viewer: 'host', operation: 'sort', by: 'name' })
    )
  ).toMatchObject({ persisted: null, reason: 'persistence_unverifiable' })
})

it('fences a provider session change while host readback is pending', async () => {
  vi.spyOn(window.api.ui, 'get').mockImplementationOnce(async () => {
    bumpProviderRuntimeSessionGeneration()
    return makePersistedUI()
  })
  expect(
    await applyWorkspaceListViewerRequest(request({ viewer: 'host', operation: 'get' }))
  ).toMatchObject({ applied: false, persisted: null, reason: 'viewer_runtime_changed' })
  expect(window.api.ui.get).toHaveBeenCalledTimes(1)
})
it('keeps accepted host preference separate from a concurrent UI edit', async () => {
  vi.spyOn(window.api.ui, 'get').mockImplementationOnce(async () => {
    fixture.state.sortBy = 'manual'
    return makePersistedUI({ sortBy: 'name' })
  })
  expect(
    await applyWorkspaceListViewerRequest(
      request({ viewer: 'host', operation: 'sort', by: 'name' })
    )
  ).toMatchObject({ applied: false, persisted: true, reason: 'viewer_surface_superseded' })
})
it('bounds a never-settling grouping Promise without inventing acceptance', async () => {
  vi.useFakeTimers()
  fixture.state.setGroupBy.mockImplementationOnce((by) => {
    fixture.state.groupBy = by
    fixture.state.collapsedGroups.clear()
    fixture.committed = by
    return new Promise<void>(() => {})
  })
  const pending = applyWorkspaceListViewerRequest(
    request({ viewer: 'host', operation: 'group', by: 'none' })
  )
  await vi.advanceTimersByTimeAsync(1000)
  expect(await pending).toMatchObject({ applied: true, writeOutcome: 'unknown', persisted: false })
})
it('bounds a never-settling host readback', async () => {
  vi.useFakeTimers()
  vi.spyOn(window.api.ui, 'get').mockImplementationOnce(() => new Promise(() => {}))
  const pending = applyWorkspaceListViewerRequest(
    request({ viewer: 'host', operation: 'sort', by: 'name' })
  )
  await vi.advanceTimersByTimeAsync(1000)
  expect(await pending).toMatchObject({ persisted: null, reason: 'persistence_unverifiable' })
})
it('waits on the requested field for a same-value dirty mirror without adding a write', async () => {
  vi.useFakeTimers()
  fixture.state.persistedUIWriteBaseline.sortBy = 'name'
  fixture.state.persistedUIWriteInFlightCounts = { sortBy: 1 }
  const pending = applyWorkspaceListViewerRequest(
    request({ viewer: 'host', operation: 'sort', by: 'recent' })
  )
  await vi.advanceTimersByTimeAsync(50)
  expect(window.api.ui.get).not.toHaveBeenCalled()
  fixture.state.persistedUIWriteBaseline.sortBy = 'recent'
  fixture.state.persistedUIWriteInFlightCounts = {}
  await vi.advanceTimersByTimeAsync(25)
  expect(await pending).toMatchObject({
    dispatched: false,
    writeOutcome: 'not_requested',
    persisted: true,
    applied: true
  })
  expect(window.api.ui.setWithAck).not.toHaveBeenCalled()
})
it('toggles a published group through the original control and reads back host state', async () => {
  expect(
    await applyWorkspaceListViewerRequest(
      request({ viewer: 'host', operation: 'group-toggle', groupKey: 'repo:two' })
    )
  ).toMatchObject({
    dispatched: true,
    applied: true,
    persisted: true,
    writeOutcome: 'unknown',
    collapsedGroups: ['repo:one', 'repo:two']
  })
  expect(fixture.control?.toggle).toHaveBeenCalledExactlyOnceWith('repo:two')
  expect(
    await applyWorkspaceListViewerRequest(
      request({ viewer: 'host', operation: 'group-toggle', groupKey: 'repo:one' })
    )
  ).toMatchObject({ applied: true, persisted: true, collapsedGroups: ['repo:two'] })
  expect(window.api.ui.set).not.toHaveBeenCalled()
})
it('refuses a group key that the committed list does not publish', async () => {
  await expect(
    applyWorkspaceListViewerRequest(
      request({ viewer: 'host', operation: 'group-toggle', groupKey: 'repo:missing' })
    )
  ).rejects.toThrow('workspace_list_group_unavailable')
  expect(fixture.control?.toggle).not.toHaveBeenCalled()
})
it('refuses a group toggle when no list control is mounted or the list is not rendered', async () => {
  const command = { viewer: 'host', operation: 'group-toggle', groupKey: 'repo:one' } as const
  fixture.control = null
  await expect(applyWorkspaceListViewerRequest(request(command))).rejects.toThrow(
    'workspace_list_group_unavailable'
  )
  fixture.control = { toggle: vi.fn() }
  fixture.rendered = false
  await expect(applyWorkspaceListViewerRequest(request(command))).rejects.toThrow(
    'workspace_list_group_unavailable'
  )
  expect(fixture.control.toggle).not.toHaveBeenCalled()
})
it('does not claim a group toggle that the host never persisted', async () => {
  fixture.control = {
    toggle: vi.fn((key: string) => {
      fixture.state.collapsedGroups = new Set([...fixture.state.collapsedGroups, key])
    })
  }
  expect(
    await applyWorkspaceListViewerRequest(
      request({ viewer: 'host', operation: 'group-toggle', groupKey: 'repo:two' })
    )
  ).toMatchObject({ applied: true, persisted: false, reason: 'persistence_superseded' })
})
it('keeps the toggle fenced to the provider runtime and the host readback', async () => {
  vi.spyOn(window.api.ui, 'get').mockImplementationOnce(async () => {
    bumpProviderRuntimeSessionGeneration()
    return makePersistedUI()
  })
  expect(
    await applyWorkspaceListViewerRequest(
      request({ viewer: 'host', operation: 'group-toggle', groupKey: 'repo:two' })
    )
  ).toMatchObject({ applied: false, persisted: null, reason: 'viewer_runtime_changed' })
})
it('waits for the host to show a delayed toggle write before claiming persistence', async () => {
  fixture.control = {
    toggle: vi.fn((key: string) => {
      fixture.state.collapsedGroups = new Set([...fixture.state.collapsedGroups, key])
      setTimeout(() => {
        fixture.durableCollapsed = [...fixture.state.collapsedGroups]
      }, 60)
    })
  }
  expect(
    await applyWorkspaceListViewerRequest(
      request({ viewer: 'host', operation: 'group-toggle', groupKey: 'repo:two' })
    )
  ).toMatchObject({ applied: true, persisted: true, collapsedGroups: ['repo:one', 'repo:two'] })
  expect(vi.mocked(window.api.ui.get).mock.calls.length).toBeGreaterThan(1)
})
it('reports a toggle as unverifiable when the host read never answers', async () => {
  vi.mocked(window.api.ui.get).mockImplementation(() => new Promise<never>(() => undefined))
  expect(
    await applyWorkspaceListViewerRequest(
      request({ viewer: 'host', operation: 'group-toggle', groupKey: 'repo:two' })
    )
  ).toMatchObject({ applied: true, persisted: null, reason: 'persistence_unverifiable' })
})
it('stops waiting when the sidebar changes the groups again during the toggle', async () => {
  vi.mocked(window.api.ui.get).mockImplementationOnce(async () => {
    fixture.state.collapsedGroups = new Set(['repo:one', 'repo:two', 'repo:other'])
    return makePersistedUI()
  })
  expect(
    await applyWorkspaceListViewerRequest(
      request({ viewer: 'host', operation: 'group-toggle', groupKey: 'repo:two' })
    )
  ).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
})
it('refuses a group toggle for an empty list or a list from another runtime', async () => {
  const command = { viewer: 'host', operation: 'group-toggle', groupKey: 'repo:one' } as const
  fixture.empty = true
  await expect(applyWorkspaceListViewerRequest(request(command))).rejects.toThrow(
    'workspace_list_group_unavailable'
  )
  fixture.empty = false
  fixture.viewRuntimeContextKey = 'other#1'
  await expect(applyWorkspaceListViewerRequest(request(command))).rejects.toThrow(
    'workspace_list_group_unavailable'
  )
  expect(fixture.control?.toggle).not.toHaveBeenCalled()
})
