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
const notify = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast: notify }))
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
  notify.success.mockReset()
  notify.error.mockReset()
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

const previewCopy = () =>
  applyActivityViewerRequest({
    id: 'preview-copy',
    expiresAt: Date.now() + 200,
    command: {
      viewer: 'host',
      surface: 'activity-page',
      operation: 'preview-copy-path',
      paneKey: 'thread'
    }
  })
function previewPortal(): HTMLElement {
  const row = document.createElement('div')
  row.dataset.activityViewerThread = 't:thread'
  const trigger = document.createElement('div')
  trigger.dataset.activityPreviewTrigger = 'owner'
  trigger.dataset.state = 'open'
  trigger.setAttribute('role', 'listitem')
  row.append(trigger)
  document.body.firstElementChild?.append(row)
  const portal = document.createElement('div')
  portal.dataset.activityPreviewOwner = 'owner'
  portal.dataset.activityPreviewPane = 'thread'
  portal.dataset.activityPreviewWorkspace = thread.worktree.id
  portal.dataset.activityPreviewHost = 'local'
  portal.dataset.state = 'open'
  const action = document.createElement('div')
  action.dataset.activityPreviewCopyPath = ''
  action.append(document.createElement('button'))
  portal.append(action)
  document.body.append(portal)
  return portal
}
it('copies an opened preview path even when workspace jump is unavailable', async () => {
  fixture.canJump = false
  previewPortal()
  expect(await previewCopy()).toMatchObject({
    applied: true,
    copyAction: { kind: 'path', writeAcknowledged: true, verified: true }
  })
  expect(write).toHaveBeenCalledExactlyOnceWith(thread.worktree.path)
})
it('rejects a closed preview without implicitly opening it', async () => {
  await expect(previewCopy()).rejects.toThrow('activity_preview_copy_unavailable')
  expect(write).not.toHaveBeenCalled()
})
it('fences replacement of the preview portal during its clipboard write', async () => {
  const portal = previewPortal()
  write.mockImplementation(async () => {
    portal.replaceWith(portal.cloneNode(true))
  })
  expect(await previewCopy()).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
  expect(read).not.toHaveBeenCalled()
})

it('preserves preview failure toast and does not read after a rejected write', async () => {
  previewPortal()
  write.mockRejectedValue(new Error('denied'))
  expect(await previewCopy()).toMatchObject({
    applied: false,
    copyAction: { writeAcknowledged: false, verified: false }
  })
  expect(notify.error).toHaveBeenCalledExactlyOnceWith('Failed to copy path')
  expect(read).not.toHaveBeenCalled()
})
it('preserves preview success toast and read-back mismatch reporting', async () => {
  previewPortal()
  read.mockResolvedValue('different')
  expect(await previewCopy()).toMatchObject({
    applied: false,
    copyAction: { writeAcknowledged: true, verified: false }
  })
  expect(notify.success).toHaveBeenCalledExactlyOnceWith('Path copied to clipboard')
})
it('fences a preview close and reopen before the write resolves', async () => {
  const portal = previewPortal()
  write.mockImplementation(async () => {
    portal.dataset.state = 'closed'
    portal.dataset.state = 'open'
  })
  expect(await previewCopy()).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
})
it('rejects a foreign portal host before copying', async () => {
  previewPortal().dataset.activityPreviewHost = 'ssh:other'
  await expect(previewCopy()).rejects.toThrow('activity_preview_copy_unavailable')
  expect(write).not.toHaveBeenCalled()
})
it('preserves an unnormalized Windows preview path without workspace availability', async () => {
  thread = {
    ...thread,
    worktree: { ...thread.worktree, path: String.raw`C:\folder workspace\task` }
  }
  fixture.canJump = false
  previewPortal()
  expect(await previewCopy()).toMatchObject({ applied: true })
  expect(write).toHaveBeenCalledExactlyOnceWith(thread.worktree.path)
})
it('rejects a preview without a path before clipboard access', async () => {
  thread = { ...thread, worktree: { ...thread.worktree, path: '' } }
  previewPortal()
  await expect(previewCopy()).rejects.toThrow('activity_preview_copy_unavailable')
  expect(write).not.toHaveBeenCalled()
})

it('rejects a path action clipped outside the preview viewport', async () => {
  previewPortal()
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement
  ) {
    return this.tagName === 'BUTTON' ? new DOMRect(0, 400, 20, 20) : new DOMRect(0, 0, 300, 200)
  })
  await expect(previewCopy()).rejects.toThrow('activity_preview_copy_unavailable')
  expect(write).not.toHaveBeenCalled()
})
