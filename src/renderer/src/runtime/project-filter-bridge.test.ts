import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { publishProjectFilterView, waitForProjectFilterView } from './project-filter-view'
import { ProjectFilterParams } from '../../../shared/rpc-contract/project-filter-params'

afterEach(() => {
  publishProjectFilterView(null)
  vi.useRealTimers()
})

describe('project filter acknowledgement', () => {
  it('requires an explicit host viewer and valid operation', () => {
    expect(ProjectFilterParams.safeParse({ operation: 'get' }).success).toBe(false)
    expect(ProjectFilterParams.safeParse({ viewer: 'caller', operation: 'clear' }).success).toBe(
      false
    )
    expect(
      ProjectFilterParams.safeParse({ viewer: 'host', operation: 'set', repoIds: [] }).success
    ).toBe(false)
    expect(
      ProjectFilterParams.safeParse({ viewer: 'host', operation: 'clear', repoIds: ['x'] }).success
    ).toBe(false)
  })
  it('waits for a matching committed list, including an empty result', async () => {
    publishProjectFilterView({
      repoIds: [],
      visibleFolderWorkspaceIds: [],
      visibleWorktreeIds: ['a', 'b']
    })
    const wait = waitForProjectFilterView(['a'], 100)
    publishProjectFilterView({
      repoIds: ['b'],
      visibleFolderWorkspaceIds: [],
      visibleWorktreeIds: ['b']
    })
    publishProjectFilterView({
      repoIds: ['a'],
      visibleFolderWorkspaceIds: [],
      visibleWorktreeIds: []
    })
    expect(await wait).toEqual({
      repoIds: ['a'],
      visibleFolderWorkspaceIds: [],
      visibleWorktreeIds: []
    })
  })
  it('does not claim a computed fallback or unmounted sidebar was rendered', async () => {
    vi.useFakeTimers()
    const wait = waitForProjectFilterView(['a'], 10)
    await vi.advanceTimersByTimeAsync(10)
    expect(await wait).toBeNull()
  })
})

const store = vi.hoisted(() => {
  const filterRepoIds: string[] = []
  const settings: { activeRuntimeEnvironmentId: string | null } = {
    activeRuntimeEnvironmentId: null
  }
  return {
    state: {
      persistedUIReady: true,
      settings,
      repos: [{ id: 'a' }, { id: 'b' }],
      filterRepoIds,
      setFilterRepoIds: vi.fn((ids: string[]) => {
        store.state.filterRepoIds = ids
        publishProjectFilterView({
          repoIds: ids,
          visibleFolderWorkspaceIds: [],
          visibleWorktreeIds: ids
        })
      }),
      notePersistedUIWriteStarted: vi.fn(),
      notePersistedUIWriteSettled: vi.fn()
    }
  }
})
vi.mock('@/store', () => ({ useAppStore: { getState: () => store.state } }))

import { applyProjectFilterRequest } from './project-filter-bridge'
import type { ProjectFilterOperation } from '../../../shared/rpc-contract/project-filter-params'

let durable: string[] = []
const save = vi.fn(async (update: { filterRepoIds: string[] }) => {
  durable = update.filterRepoIds
})
const request = (command: ProjectFilterOperation) => ({
  id: 'r',
  expiresAt: Date.now() + 9000,
  command
})

beforeEach(() => {
  durable = []
  store.state.filterRepoIds = []
  store.state.settings.activeRuntimeEnvironmentId = null
  store.state.persistedUIReady = true
  vi.clearAllMocks()
  save.mockImplementation(async (update) => {
    durable = update.filterRepoIds
  })
  vi.stubGlobal('window', {
    api: { ui: { setWithAck: save, get: async () => ({ filterRepoIds: durable }) } }
  })
})

describe('project filter transaction', () => {
  it('sets and clears through acknowledged storage and committed list publication', async () => {
    expect(
      await applyProjectFilterRequest(
        request({ viewer: 'host', operation: 'set', repoIds: ['a', 'a'] })
      )
    ).toMatchObject({
      repoIds: ['a'],
      persisted: true,
      applied: true,
      visibleFolderWorkspaceIds: [],
      visibleWorktreeIds: ['a']
    })
    expect(save).toHaveBeenCalledWith({ filterRepoIds: ['a'] })
    expect(
      await applyProjectFilterRequest(request({ viewer: 'host', operation: 'get' }))
    ).toMatchObject({ repoIds: ['a'], persisted: true, applied: true })
    expect(save).toHaveBeenCalledTimes(1)
    expect(
      await applyProjectFilterRequest(request({ viewer: 'host', operation: 'clear' }))
    ).toMatchObject({ repoIds: [], persisted: true, applied: true })
  })
  it('rejects invalid projects, expired requests, wrong runtime and unhydrated viewers before writing', async () => {
    await expect(
      applyProjectFilterRequest(request({ viewer: 'host', operation: 'set', repoIds: ['missing'] }))
    ).rejects.toThrow('project_not_found')
    await expect(
      applyProjectFilterRequest({
        ...request({ viewer: 'host', operation: 'clear' }),
        expiresAt: 0
      })
    ).rejects.toThrow('request_expired')
    store.state.settings.activeRuntimeEnvironmentId = 'remote'
    await expect(
      applyProjectFilterRequest(request({ viewer: 'host', operation: 'clear' }))
    ).rejects.toThrow('viewer_runtime_mismatch')
    store.state.settings.activeRuntimeEnvironmentId = null
    store.state.persistedUIReady = false
    await expect(
      applyProjectFilterRequest(request({ viewer: 'host', operation: 'clear' }))
    ).rejects.toThrow('viewer_not_ready')
    expect(save).not.toHaveBeenCalled()
  })
  it('preserves the current filter and settles the in-flight field after persistence failure', async () => {
    save.mockRejectedValueOnce(new Error('disk_failure'))
    await expect(
      applyProjectFilterRequest(request({ viewer: 'host', operation: 'set', repoIds: ['a'] }))
    ).rejects.toThrow('disk_failure')
    expect(store.state.filterRepoIds).toEqual([])
    expect(store.state.notePersistedUIWriteSettled).toHaveBeenCalledWith(['filterRepoIds'], null)
  })
  it('reports persisted separately when a concurrent edit prevents application', async () => {
    vi.useFakeTimers()
    save.mockImplementationOnce(async (update) => {
      durable = update.filterRepoIds
      store.state.filterRepoIds = ['b']
    })
    const pending = applyProjectFilterRequest(
      request({ viewer: 'host', operation: 'set', repoIds: ['a'] })
    )
    await vi.advanceTimersByTimeAsync(5000)
    expect(await pending).toMatchObject({
      persisted: true,
      applied: false,
      visibleWorktreeIds: null
    })
    expect(store.state.filterRepoIds).toEqual(['b'])
  })
})
