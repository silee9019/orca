// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type {
  ActivityThreadGroup,
  AgentPaneThread
} from '@/components/activity/activity-thread-types'
import {
  makeRepo,
  makeTab,
  makeWorktree
} from '@/components/activity/ActivityPrototypePage-test-fixtures'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { applyActivityViewerRequest } from './activity-viewer-bridge'

const fixture = vi.hoisted(() => {
  const groups: ActivityThreadGroup[] = []
  const listeners = new Set<() => void>()
  return {
    groups,
    listeners,
    collapsedKeys: new Set<string>(),
    available: true,
    mounted: true,
    query: '',
    queryRevision: 0,
    logicalAck: true,
    toggle: vi.fn<(key: string) => void>(),
    state: {
      persistedUIReady: true,
      settings: { activeRuntimeEnvironmentId: null },
      agentsGroupBy: 'status',
      agentsReadFilter: 'all',
      agentsCompactMode: false,
      agentsShowChildAgents: true,
      agentsVisibleHostIds: null,
      agentsFilterRepoIds: [],
      agentsHideWorkspacesFromOtherDevices: false,
      agentsHideAutomationGeneratedWorkspaces: false,
      agentsHideCliCreatedWorkspaces: false
    }
  }
})
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
  readActivityGroupCollapseControl: () =>
    fixture.available
      ? {
          groups: fixture.groups,
          queryRevision: fixture.queryRevision,
          collapsedKeys: fixture.collapsedKeys,
          toggle: (key: string) => fixture.toggle(key)
        }
      : null,
  readActivityViewerView: (surface: string) =>
    fixture.mounted
      ? {
          surface,
          runtimeContextKey: getProviderRuntimeContextKey(fixture.state.settings),
          groupBy: fixture.state.agentsGroupBy,
          readFilter: 'all',
          compact: false,
          showChildAgents: true,
          querySettled: true,
          query: fixture.query,
          logicalRows: fixture.groups.flatMap((group) =>
            fixture.collapsedKeys.has(group.key) && fixture.logicalAck
              ? []
              : group.threads.map((thread) => ({ kind: 'thread', key: `t:${thread.paneKey}` }))
          )
        }
      : null
}))
let root: HTMLElement
let button: HTMLElement
const run = (groupKey = 'status:done') =>
  applyActivityViewerRequest({
    id: 'group',
    expiresAt: Date.now() + 180,
    command: { viewer: 'host', surface: 'activity-page', operation: 'group-toggle', groupKey }
  })
beforeEach(() => {
  Object.assign(fixture, {
    available: true,
    mounted: true,
    query: '',
    queryRevision: 0,
    logicalAck: true
  })
  fixture.state.agentsGroupBy = 'status'
  fixture.collapsedKeys.clear()
  const tab = makeTab()
  const thread: AgentPaneThread = {
    tab,
    worktree: makeWorktree(),
    repo: makeRepo(),
    paneKey: 'pane',
    paneTitle: '',
    agentType: 'claude',
    events: [],
    latestEvent: null,
    latestTimestamp: 1,
    currentAgentState: null,
    currentAgentEntry: null,
    unread: true,
    responsePreview: ''
  }
  fixture.groups = [{ key: 'status:done', label: 'Done', state: 'done', threads: [thread] }]
  root = document.createElement('div')
  root.dataset.activityViewer = 'activity-page'
  const header = document.createElement('div')
  header.dataset.activityStickyHeader = 'status:done'
  button = document.createElement('div')
  button.setAttribute('role', 'button')
  button.setAttribute('aria-expanded', 'true')
  header.append(button)
  root.append(header)
  document.body.append(root)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(0, 0, 800, 600)
  )
  fixture.toggle.mockReset().mockImplementation((key) => {
    if (fixture.collapsedKeys.has(key)) {
      fixture.collapsedKeys.delete(key)
    } else {
      fixture.collapsedKeys.add(key)
    }
    button.setAttribute('aria-expanded', String(!fixture.collapsedKeys.has(key)))
  })
})
afterEach(() => {
  expect(fixture.listeners.size).toBe(0)
  document.body.replaceChildren()
  vi.restoreAllMocks()
})
it.each([false, true])(
  'uses one original toggle and observes collapsed=%s',
  async (initialCollapsed) => {
    if (initialCollapsed) {
      fixture.collapsedKeys.add('status:done')
      button.setAttribute('aria-expanded', 'false')
    }
    expect(await run()).toMatchObject({
      applied: true,
      persisted: null,
      writeOutcome: 'not_requested',
      groupAction: {
        key: 'status:done',
        requestedCollapsed: !initialCollapsed,
        currentCollapsed: !initialCollapsed
      }
    })
    expect(fixture.toggle).toHaveBeenCalledExactlyOnceWith('status:done')
  }
)
it.each(['missing', 'unknown', 'none', 'unmounted'])(
  'rejects %s without invoking the original toggle',
  async (kind) => {
    if (kind === 'missing') {
      fixture.available = false
    }
    if (kind === 'none') {
      fixture.state.agentsGroupBy = 'none'
    }
    if (kind === 'unmounted') {
      fixture.mounted = false
    }
    await expect(run(kind === 'unknown' ? 'other' : undefined)).rejects.toThrow()
    expect(fixture.toggle).not.toHaveBeenCalled()
  }
)
it('requires both the logical collapse and the actual header acknowledgement', async () => {
  fixture.logicalAck = false
  expect(await run()).toMatchObject({ applied: false })
  expect(fixture.toggle).toHaveBeenCalledTimes(1)
})
it('rejects an unmounted source and does not replay', async () => {
  fixture.toggle.mockImplementation(() => {
    fixture.mounted = false
    root.remove()
  })
  expect(await run()).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
  expect(fixture.toggle).toHaveBeenCalledTimes(1)
})
it('rejects a changed local query instead of applying to another list', async () => {
  fixture.toggle.mockImplementation(() => {
    fixture.query = 'other'
  })
  expect(await run()).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
})

it('fences grouping changes even when they return before the parent finishes', async () => {
  const original = fixture.toggle.getMockImplementation()
  fixture.toggle.mockImplementation((key) => {
    original?.(key)
    fixture.state.agentsGroupBy = 'project'
    for (const listener of fixture.listeners) {
      listener()
    }
    fixture.state.agentsGroupBy = 'status'
    for (const listener of fixture.listeners) {
      listener()
    }
  })
  expect(await run()).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
  expect(fixture.toggle).toHaveBeenCalledTimes(1)
})

it('rejects a stale rendered header even when logical collapse is acknowledged', async () => {
  fixture.toggle.mockImplementation((key) => {
    fixture.collapsedKeys.add(key)
  })
  expect(await run()).toMatchObject({ applied: false })
  expect(fixture.toggle).toHaveBeenCalledTimes(1)
})

it.each(['aria-hidden', 'inert', 'opacity'])(
  'rejects hidden root through %s before invoking the original toggle',
  async (kind) => {
    if (kind === 'aria-hidden') {
      root.setAttribute('aria-hidden', 'true')
    }
    if (kind === 'inert') {
      root.inert = true
    }
    if (kind === 'opacity') {
      root.style.opacity = '0'
    }
    await expect(run()).rejects.toThrow('activity_group_control_unavailable')
    expect(fixture.toggle).not.toHaveBeenCalled()
  }
)

it('fences committed query changes that return before the next poll', async () => {
  const original = fixture.toggle.getMockImplementation()
  fixture.toggle.mockImplementation((key) => {
    original?.(key)
    fixture.query = 'other'
    fixture.queryRevision++
    fixture.query = ''
    fixture.queryRevision++
  })
  expect(await run()).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
  expect(fixture.toggle).toHaveBeenCalledTimes(1)
})
