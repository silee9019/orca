// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  makeRepo,
  makeTabWithIds,
  makeWorktree
} from '@/components/activity/ActivityPrototypePage-test-fixtures'
import type { AgentPaneThread } from '@/components/activity/activity-thread-types'
import { activityThreadRowCopy } from '@/components/activity/activity-thread-presentation'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { readActivityScope } from './activity-scope-preferences'
import { applyActivityViewerRequest } from './activity-viewer-bridge'
const fixture = vi.hoisted(() => ({
  listeners: new Set<() => void>(),
  hidden: false,
  queryRevision: 0,
  staleScope: false,
  canJump: true,
  state: {
    persistedUIReady: true,
    settings: { activeRuntimeEnvironmentId: null },
    activeView: 'activity',
    activeWorktreeId: 'workspace',
    sidebarOpen: true,
    sidebarBody: 'agents',
    agentsGroupBy: 'none',
    agentsReadFilter: 'all',
    agentsCompactMode: false,
    agentsShowChildAgents: true,
    agentsVisibleHostIds: null,
    agentsFilterRepoIds: [],
    agentsHideWorkspacesFromOtherDevices: false,
    agentsHideAutomationGeneratedWorkspaces: false,
    agentsHideCliCreatedWorkspaces: false
  }
}))
let thread: AgentPaneThread
const write = vi.fn<(value: string) => Promise<void>>()
const read = vi.fn<() => Promise<string>>()
vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => fixture.state,
    subscribe: (listener: () => void) => {
      fixture.listeners.add(listener)
      return () => fixture.listeners.delete(listener)
    }
  }
}))
vi.mock('./activity-viewer-view', () => ({
  readActivityViewerView: (surface: string) => ({
    surface,
    runtimeContextKey: getProviderRuntimeContextKey(fixture.state.settings),
    groupBy: fixture.state.agentsGroupBy,
    readFilter: fixture.state.agentsReadFilter,
    compact: fixture.state.agentsCompactMode,
    showChildAgents: fixture.state.agentsShowChildAgents,
    querySettled: true,
    query: '',
    scope: {
      ...readActivityScope(fixture.state),
      filterRepoIds: fixture.staleScope ? ['stale'] : []
    }
  }),
  readActivityGroupCollapseControl: () => ({ queryRevision: fixture.queryRevision }),
  readActivityNavigationControl: () => ({
    visibleThreads: fixture.hidden ? [] : [thread],
    canJump: () => fixture.canJump
  })
}))
const run = (kind: 'title' | 'path' = 'title') =>
  applyActivityViewerRequest({
    id: 'copy',
    expiresAt: Date.now() + 200,
    command: {
      viewer: 'host',
      surface: 'activity-page',
      operation: 'copy',
      paneKey: 'thread',
      kind
    }
  })
beforeEach(() => {
  const worktree = makeWorktree()
  thread = {
    paneKey: 'thread',
    unread: false,
    worktree,
    repo: makeRepo(),
    tab: makeTabWithIds('tab', worktree.id),
    paneTitle: 'task',
    agentType: 'claude',
    currentAgentState: null,
    currentAgentEntry: null,
    responsePreview: '',
    latestTimestamp: 1,
    latestEvent: null,
    events: []
  }
  fixture.queryRevision = 0
  fixture.hidden = false
  fixture.staleScope = false
  fixture.canJump = true
  fixture.state.activeView = 'activity'
  const root = document.createElement('aside')
  root.dataset.activityViewer = 'activity-page'
  document.body.append(root)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 300, 200)
  )
  Object.defineProperty(window, 'api', {
    value: { ui: { writeClipboardText: write, readClipboardText: read } },
    configurable: true
  })
  write.mockResolvedValue()
  read.mockImplementation(async () => write.mock.calls.at(-1)?.[0] ?? '')
})
afterEach(() => {
  expect(fixture.listeners.size).toBe(0)
  document.body.replaceChildren()
  vi.restoreAllMocks()
  write.mockReset()
  read.mockReset()
})
it.each(['title', 'path'] as const)(
  'writes original %s once and verifies bytes without returning them',
  async (kind) => {
    const result = await run(kind)
    const value = kind === 'title' ? activityThreadRowCopy(thread).taskTitle : thread.worktree.path
    expect(write).toHaveBeenCalledExactlyOnceWith(value)
    expect(read).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({
      applied: true,
      persisted: null,
      copyAction: { paneKey: 'thread', kind, writeAcknowledged: true, verified: true }
    })
    expect(result.copyAction).not.toHaveProperty('value')
  }
)
it('rejects a filtered-out target before any clipboard access', async () => {
  fixture.hidden = true
  await expect(run()).rejects.toThrow('activity_thread_unavailable')
  expect(write).not.toHaveBeenCalled()
  expect(read).not.toHaveBeenCalled()
})
it('preserves path availability for standalone or missing workspaces', async () => {
  fixture.canJump = false
  await expect(run('path')).rejects.toThrow('activity_copy_unavailable')
  expect(write).not.toHaveBeenCalled()
})
it('rejects stale committed scope before clipboard access', async () => {
  fixture.staleScope = true
  await expect(run()).rejects.toThrow('activity_surface_unavailable')
  expect(write).not.toHaveBeenCalled()
})
it('does not claim a write acknowledgement as verified clipboard content', async () => {
  read.mockResolvedValue('different')
  expect(await run()).toMatchObject({
    applied: false,
    copyAction: { writeAcknowledged: true, verified: false }
  })
  expect(write).toHaveBeenCalledTimes(1)
})
it('fences a view departure and return during the write', async () => {
  write.mockImplementation(async () => {
    fixture.state.activeView = 'settings'
    for (const listener of fixture.listeners) {
      listener()
    }
    fixture.state.activeView = 'activity'
    for (const listener of fixture.listeners) {
      listener()
    }
  })
  expect(await run()).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
  expect(write).toHaveBeenCalledTimes(1)
})
it('does not read or retry after a rejected write', async () => {
  write.mockRejectedValue(new Error('write_denied'))
  expect(await run()).toMatchObject({
    applied: false,
    copyAction: { writeAcknowledged: false, verified: false }
  })
  expect(write).toHaveBeenCalledTimes(1)
  expect(read).not.toHaveBeenCalled()
})
it('does not claim completion when the clipboard read is denied', async () => {
  read.mockRejectedValue(new Error('read_denied'))
  expect(await run()).toMatchObject({
    applied: false,
    copyAction: { writeAcknowledged: true, verified: false }
  })
  expect(write).toHaveBeenCalledTimes(1)
})
it('fences replacement of the original root during the write', async () => {
  write.mockImplementation(async () => {
    const replacement = document.createElement('aside')
    replacement.dataset.activityViewer = 'activity-page'
    document.body.replaceChildren(replacement)
  })
  expect(await run()).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
  expect(read).not.toHaveBeenCalled()
})
it('rejects a hidden surface before any clipboard access', async () => {
  document.body.firstElementChild?.setAttribute('hidden', '')
  await expect(run()).rejects.toThrow('activity_surface_unavailable')
  expect(write).not.toHaveBeenCalled()
})

it('fences a replacement owner with the same pane key and copy text', async () => {
  write.mockImplementation(async () => {
    thread = { ...thread, worktree: { ...thread.worktree, id: 'another-workspace' } }
  })
  expect(await run()).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
})
it('fences committed query departure and return during the write', async () => {
  write.mockImplementation(async () => {
    fixture.queryRevision += 2
  })
  expect(await run()).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
})
