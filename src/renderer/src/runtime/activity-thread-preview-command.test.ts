// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  makeRepo,
  makeTabWithIds,
  makeWorktree
} from '@/components/activity/ActivityPrototypePage-test-fixtures'
import type { AgentPaneThread } from '@/components/activity/activity-thread-types'
import { getWorktreeExecutionHostId } from '../../../shared/execution-host'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { readActivityScope } from './activity-scope-preferences'
import { applyActivityViewerRequest } from './activity-viewer-bridge'
const fixture = vi.hoisted(() => ({
  listeners: new Set<() => void>(),
  hidden: false,
  queryRevision: 0,
  staleScope: false,
  canJump: true,
  rowTop: 20,
  commit: true,
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
let root: HTMLElement
let trigger: HTMLElement
const pointer = vi.fn<(type: string) => void>()
const select = vi.fn()
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
const run = (enabled = true) =>
  applyActivityViewerRequest({
    id: 'preview',
    expiresAt: Date.now() + 150,
    command: {
      viewer: 'host',
      surface: 'activity-page',
      operation: 'preview',
      paneKey: 'thread',
      enabled
    }
  })
function publishPreview(): void {
  const content = document.createElement('div')
  content.dataset.activityPreviewOwner = 'owner'
  content.dataset.activityPreviewPane = thread.paneKey
  content.dataset.activityPreviewWorkspace = thread.worktree.id
  content.dataset.activityPreviewHost = getWorktreeExecutionHostId(
    thread.worktree,
    thread.repo ?? undefined
  )
  content.dataset.state = 'open'
  document.body.append(content)
  trigger.dataset.state = 'open'
}
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
  fixture.rowTop = 20
  fixture.commit = true
  fixture.state.activeView = 'activity'
  root = document.createElement('aside')
  root.dataset.activityViewer = 'activity-page'
  const scroll = document.createElement('div')
  const list = document.createElement('div')
  list.dataset.activityVirtualList = ''
  const wrapper = document.createElement('div')
  wrapper.dataset.activityViewerThread = 't:thread'
  trigger = document.createElement('div')
  trigger.dataset.slot = 'hover-card-trigger'
  trigger.dataset.activityPreviewTrigger = 'owner'
  trigger.dataset.state = 'closed'
  trigger.setAttribute('role', 'listitem')
  trigger.addEventListener('click', select)
  for (const type of ['pointerover', 'pointerout']) {
    trigger.addEventListener(type, () => {
      pointer(type)
      if (!fixture.commit) {
        return
      }
      if (type === 'pointerover') {
        publishPreview()
      } else {
        document.querySelector('[data-activity-preview-owner]')?.remove()
        trigger.dataset.state = 'closed'
      }
    })
  }
  wrapper.append(trigger)
  list.append(wrapper)
  scroll.append(list)
  root.append(scroll)
  document.body.append(root)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement
  ) {
    return this === trigger ? new DOMRect(0, fixture.rowTop, 300, 80) : new DOMRect(0, 0, 300, 200)
  })
})
afterEach(() => {
  expect(fixture.listeners.size).toBe(0)
  expect(select).not.toHaveBeenCalled()
  document.body.replaceChildren()
  vi.restoreAllMocks()
  pointer.mockReset()
  select.mockReset()
})
it('opens the exact portal through one original mouse pointer event', async () => {
  expect(await run()).toMatchObject({
    applied: true,
    persisted: null,
    previewAction: { paneKey: 'thread', enabled: true, visible: true }
  })
  expect(pointer).toHaveBeenCalledExactlyOnceWith('pointerover')
})
it('closes through the original pointer leave without row selection', async () => {
  publishPreview()
  expect(await run(false)).toMatchObject({
    applied: true,
    previewAction: { enabled: false, visible: false }
  })
  expect(pointer).toHaveBeenCalledExactlyOnceWith('pointerout')
})
it('preserves suppressed open and menu pending close as unapplied', async () => {
  fixture.commit = false
  expect(await run()).toMatchObject({ applied: false, previewAction: { visible: false } })
  publishPreview()
  expect(await run(false)).toMatchObject({ applied: false, previewAction: { visible: true } })
  expect(pointer).toHaveBeenCalledTimes(2)
})
it('rejects overscan-only triggers before dispatch', async () => {
  fixture.rowTop = 900
  await expect(run()).rejects.toThrow('activity_preview_unavailable')
  expect(pointer).not.toHaveBeenCalled()
})
it('rejects a filtered target before dispatch', async () => {
  fixture.hidden = true
  await expect(run()).rejects.toThrow('activity_thread_unavailable')
  expect(pointer).not.toHaveBeenCalled()
})
it('rejects stale committed scope before dispatch', async () => {
  fixture.staleScope = true
  await expect(run()).rejects.toThrow('activity_surface_unavailable')
  expect(pointer).not.toHaveBeenCalled()
})
it('does not approve a portal attached to another trigger owner', async () => {
  pointer.mockImplementation(() => {
    const content = document.querySelector<HTMLElement>('[data-activity-preview-owner]')
    if (content) {
      content.dataset.activityPreviewOwner = 'other'
    }
  })
  fixture.commit = false
  publishPreview()
  document
    .querySelector<HTMLElement>('[data-activity-preview-owner]')
    ?.setAttribute('data-activity-preview-owner', 'other')
  expect(await run()).toMatchObject({ applied: false })
})
it('fences committed query departure and return during dispatch', async () => {
  pointer.mockImplementation(() => {
    fixture.queryRevision += 2
  })
  expect(await run()).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
})
it('accepts already closed only through the available original trigger', async () => {
  expect(await run(false)).toMatchObject({ applied: true, previewAction: { visible: false } })
  expect(pointer).toHaveBeenCalledExactlyOnceWith('pointerout')
})
it('rejects a missing trigger marker before dispatch', async () => {
  delete trigger.dataset.activityPreviewTrigger
  await expect(run()).rejects.toThrow('activity_preview_unavailable')
  expect(pointer).not.toHaveBeenCalled()
})
it('fences target owner replacement during dispatch', async () => {
  pointer.mockImplementation(() => {
    thread = { ...thread, worktree: { ...thread.worktree, id: 'different-workspace' } }
  })
  expect(await run()).toMatchObject({
    applied: false,
    reason: 'viewer_surface_superseded',
    previewAction: { visible: null }
  })
})
it('fences view departure and return during dispatch', async () => {
  pointer.mockImplementation(() => {
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
})
