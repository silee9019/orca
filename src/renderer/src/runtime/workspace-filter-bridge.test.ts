import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  defaultWorkspaceFilters,
  readWorkspaceFilters
} from '../../../shared/workspace-filter-command'
import type { WorkspaceFilterCommand } from '../../../shared/rpc-contract/workspace-filter-params'
import {
  bumpProviderRuntimeSessionGeneration,
  getProviderRuntimeContextKey
} from '@/lib/provider-runtime-context'
import { publishWorkspaceFilterView } from './workspace-filter-view'
import { publishProjectFilterControl } from './project-filter-controls'

const store = vi.hoisted(() => {
  const settings: { activeRuntimeEnvironmentId: string | null } = {
    activeRuntimeEnvironmentId: null
  }
  return {
    state: {
      persistedUIReady: true,
      persistedUIWriteBaselineGeneration: 4,
      settings,
      repos: [{ id: 'a' }, { id: 'b' }],
      showSleepingWorkspaces: true,
      alwaysShowDefaultBranchWorkspace: true,
      hideDefaultBranchWorkspace: false,
      hideAutomationGeneratedWorkspaces: false,
      hideCliCreatedWorkspaces: false,
      hideDetachedHeadWorkspaces: false,
      filterRepoIds: ['a'],
      notePersistedUIWriteStarted: vi.fn(),
      notePersistedUIWriteSettled: vi.fn()
    }
  }
})
vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => store.state,
    setState: vi.fn((patch) => {
      Object.assign(store.state, patch)
      publishWorkspaceFilterView({
        filters: readWorkspaceFilters(store.state),
        runtimeContextKey: getProviderRuntimeContextKey(store.state.settings),
        visibleWorktreeIds: [],
        visibleFolderWorkspaceIds: ['folder']
      })
    })
  }
}))
import { applyWorkspaceFilterRequest } from './workspace-filter-bridge'

let durable = defaultWorkspaceFilters()
const save = vi.fn(async (patch) => {
  Object.assign(durable, patch)
})
const request = (command: WorkspaceFilterCommand) => ({
  id: 'test',
  expiresAt: Date.now() + 9000,
  command
})

beforeEach(() => {
  Object.assign(store.state, defaultWorkspaceFilters(), {
    filterRepoIds: ['a'],
    persistedUIReady: true
  })
  store.state.settings.activeRuntimeEnvironmentId = null
  durable = readWorkspaceFilters(store.state)
  vi.clearAllMocks()
  save.mockImplementation(async (patch) => {
    Object.assign(durable, patch)
  })
  vi.stubGlobal('window', { api: { ui: { setWithAck: save, get: async () => durable } } })
})
afterEach(() => {
  publishWorkspaceFilterView(null)
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('workspace filters preserve viewer and persistence ownership', () => {
  it('does not clear a newer search typed while the selected project is being saved', async () => {
    const snapshot = {
      open: true,
      query: 'b',
      highlightedRepoId: 'b',
      resultRepoIds: ['b'],
      inputFocused: true
    }
    const apply = vi.fn()
    let dispose = publishProjectFilterControl('project-panel', { snapshot, apply })
    save.mockImplementationOnce(async (patch) => {
      Object.assign(durable, patch)
      dispose()
      dispose = publishProjectFilterControl('project-panel', {
        snapshot: { ...snapshot, query: 'new-search' },
        apply
      })
    })
    try {
      await expect(
        applyWorkspaceFilterRequest(
          request({
            viewer: 'host',
            operation: 'select-project',
            surface: 'project-panel',
            repoId: 'b'
          })
        )
      ).rejects.toThrow('filter_control_superseded')
      expect(apply).not.toHaveBeenCalled()
      expect(durable.filterRepoIds).toEqual(['a', 'b'])
    } finally {
      dispose()
    }
  })
  it('selects the highlighted project and clears its query without synthesizing a keyboard event', async () => {
    const snapshot = {
      open: true,
      query: 'b',
      highlightedRepoId: 'b',
      resultRepoIds: ['b'],
      inputFocused: true
    }
    let dispose = publishProjectFilterControl('project-panel', {
      snapshot,
      apply: (command) => {
        if (command.action !== 'search') {
          throw new Error('unexpected_control')
        }
        dispose()
        dispose = publishProjectFilterControl('project-panel', {
          snapshot: { ...snapshot, query: command.query },
          apply: vi.fn()
        })
      }
    })
    try {
      expect(
        await applyWorkspaceFilterRequest(
          request({
            viewer: 'host',
            operation: 'select-project',
            surface: 'project-panel',
            repoId: 'b'
          })
        )
      ).toMatchObject({
        filters: { filterRepoIds: ['a', 'b'] },
        persisted: true,
        applied: true,
        control: { query: '', inputFocused: true }
      })
    } finally {
      dispose()
    }
  })
  it('removes the last visible pill only with an empty project-panel query', async () => {
    store.state.filterRepoIds = ['obsolete', 'b', 'a']
    durable = readWorkspaceFilters(store.state)
    let dispose = publishProjectFilterControl('project-panel', {
      snapshot: {
        open: true,
        query: 'a',
        highlightedRepoId: 'a',
        resultRepoIds: ['a'],
        inputFocused: true
      },
      apply: vi.fn()
    })
    try {
      await expect(
        applyWorkspaceFilterRequest(
          request({ viewer: 'host', operation: 'remove-last-project', surface: 'project-panel' })
        )
      ).rejects.toThrow('filter_query_not_empty')
      expect(save).not.toHaveBeenCalled()
      dispose()
      dispose = publishProjectFilterControl('project-panel', {
        snapshot: {
          open: true,
          query: '',
          highlightedRepoId: '',
          resultRepoIds: [],
          inputFocused: true
        },
        apply: vi.fn()
      })
      expect(
        await applyWorkspaceFilterRequest(
          request({ viewer: 'host', operation: 'remove-last-project', surface: 'project-panel' })
        )
      ).toMatchObject({
        filters: { filterRepoIds: ['obsolete', 'a'] },
        persisted: true,
        applied: true
      })
    } finally {
      dispose()
    }
  })
  it('toggles one project and removes stale pills without replacing the other selection', async () => {
    expect(
      await applyWorkspaceFilterRequest(
        request({ viewer: 'host', operation: 'toggle-project', repoId: 'b' })
      )
    ).toMatchObject({ filters: { filterRepoIds: ['a', 'b'] }, persisted: true, applied: true })
    expect(
      await applyWorkspaceFilterRequest(
        request({ viewer: 'host', operation: 'toggle-project', repoId: 'a' })
      )
    ).toMatchObject({ filters: { filterRepoIds: ['b'] }, persisted: true, applied: true })
    expect(
      await applyWorkspaceFilterRequest(
        request({ viewer: 'host', operation: 'remove-project', repoId: 'b' })
      )
    ).toMatchObject({ filters: { filterRepoIds: [] }, persisted: true, applied: true })
  })
  it('persists only requested fields and reports the actual empty list and folder row', async () => {
    const result = await applyWorkspaceFilterRequest(
      request({ viewer: 'host', operation: 'set', filters: { hideCliCreatedWorkspaces: true } })
    )
    expect(save).toHaveBeenCalledWith({ hideCliCreatedWorkspaces: true })
    expect(result).toMatchObject({
      persisted: true,
      applied: true,
      filters: { filterRepoIds: ['a'], hideCliCreatedWorkspaces: true },
      visibleWorktreeIds: [],
      visibleFolderWorkspaceIds: ['folder']
    })
    expect(store.state.notePersistedUIWriteSettled).toHaveBeenCalledWith(
      ['hideCliCreatedWorkspaces'],
      { hideCliCreatedWorkspaces: true },
      { sentAtGeneration: 4 }
    )
  })
  it('resets the same seven filters as the sidebar reset button', async () => {
    store.state.hideDetachedHeadWorkspaces = true
    expect(
      await applyWorkspaceFilterRequest(request({ viewer: 'host', operation: 'reset' }))
    ).toMatchObject({ persisted: true, applied: true, filters: defaultWorkspaceFilters() })
    expect(save).toHaveBeenCalledWith(defaultWorkspaceFilters())
  })
  it('rejects unready, expired, remote and stale project targets before saving', async () => {
    const command = {
      viewer: 'host',
      operation: 'set',
      filters: { filterRepoIds: ['missing'] }
    } as const
    await expect(
      applyWorkspaceFilterRequest(request({ ...command, filters: { filterRepoIds: ['missing'] } }))
    ).rejects.toThrow('project_not_found')
    await expect(
      applyWorkspaceFilterRequest({
        ...request({ viewer: 'host', operation: 'reset' }),
        expiresAt: 0
      })
    ).rejects.toThrow('request_expired')
    store.state.settings.activeRuntimeEnvironmentId = 'remote'
    await expect(
      applyWorkspaceFilterRequest(request({ viewer: 'host', operation: 'reset' }))
    ).rejects.toThrow('viewer_runtime_mismatch')
    store.state.settings.activeRuntimeEnvironmentId = null
    store.state.persistedUIReady = false
    await expect(
      applyWorkspaceFilterRequest(request({ viewer: 'host', operation: 'reset' }))
    ).rejects.toThrow('viewer_not_ready')
    expect(save).not.toHaveBeenCalled()
  })
  it('keeps a newer local edit instead of applying a saved older request', async () => {
    vi.useFakeTimers()
    save.mockImplementationOnce(async (patch) => {
      Object.assign(durable, patch)
      store.state.filterRepoIds = ['b']
    })
    const result = applyWorkspaceFilterRequest(
      request({ viewer: 'host', operation: 'set', filters: { filterRepoIds: [] } })
    )
    await vi.advanceTimersByTimeAsync(5000)
    expect(await result).toMatchObject({
      persisted: true,
      applied: false,
      visibleWorktreeIds: null
    })
    expect(store.state.filterRepoIds).toEqual(['b'])
  })
  it('does not accept a previous runtime generation after leaving and returning', async () => {
    vi.useFakeTimers()
    const read = vi.spyOn(window.api.ui, 'get')
    publishWorkspaceFilterView({
      filters: defaultWorkspaceFilters(),
      runtimeContextKey: getProviderRuntimeContextKey(store.state.settings),
      visibleWorktreeIds: ['old'],
      visibleFolderWorkspaceIds: []
    })
    save.mockImplementationOnce(async (patch) => {
      Object.assign(durable, patch)
      bumpProviderRuntimeSessionGeneration()
    })
    const result = applyWorkspaceFilterRequest(request({ viewer: 'host', operation: 'reset' }))
    await vi.advanceTimersByTimeAsync(5000)
    expect(await result).toMatchObject({
      persisted: null,
      applied: false,
      reason: 'viewer_runtime_changed_persistence_unknown'
    })
    expect(read).not.toHaveBeenCalled()
    expect(store.state.notePersistedUIWriteSettled).toHaveBeenCalledWith(expect.any(Array), null, {
      sentAtGeneration: 4
    })
    expect(store.state.filterRepoIds).toEqual(['a'])
  })
  it('settles failed writes without applying them', async () => {
    save.mockRejectedValueOnce(new Error('disk_failure'))
    await expect(
      applyWorkspaceFilterRequest(request({ viewer: 'host', operation: 'reset' }))
    ).rejects.toThrow('disk_failure')
    expect(store.state.filterRepoIds).toEqual(['a'])
    expect(store.state.notePersistedUIWriteSettled).toHaveBeenCalledWith(expect.any(Array), null, {
      sentAtGeneration: 4
    })
  })
})
