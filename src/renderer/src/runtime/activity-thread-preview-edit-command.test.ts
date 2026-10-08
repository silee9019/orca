// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  makeRepo,
  makeTabWithIds,
  makeWorktree
} from '@/components/activity/ActivityPrototypePage-test-fixtures'
import type { AgentPaneThread } from '@/components/activity/activity-thread-types'
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
let activeModal: string = 'none'
let modalData: Record<string, unknown> = {}
let portal: HTMLElement
let action: HTMLButtonElement
let commit: () => void
const click = vi.fn()
vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({ ...fixture.state, activeModal, modalData }),
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

const run = (field: 'issue' | 'comment' = 'comment') =>
  applyActivityViewerRequest({
    id: 'edit',
    expiresAt: Date.now() + 100,
    command: {
      viewer: 'host',
      surface: 'activity-page',
      operation: 'preview-edit',
      paneKey: 'thread',
      field
    }
  })
function commitModal(field: 'issue' | 'comment' = 'comment'): HTMLElement {
  activeModal = 'edit-meta'
  modalData = {
    worktreeId: thread.worktree.id,
    repoId: thread.worktree.repoId,
    executionHostId: thread.worktree.hostId,
    focus: field
  }
  for (const listener of fixture.listeners) {
    listener()
  }
  portal.remove()
  document.querySelector('[data-activity-viewer]')?.setAttribute('aria-hidden', 'true')
  const dialog = document.createElement('div')
  dialog.setAttribute('role', 'dialog')
  dialog.dataset.worktreeMetaWorkspace = thread.worktree.id
  dialog.dataset.worktreeMetaRepo = thread.worktree.repoId
  dialog.dataset.worktreeMetaHost = 'local'
  dialog.dataset.worktreeMetaFocus = field
  dialog.dataset.worktreeMetaSeedReady = 'true'
  const label = document.createElement('label')
  label.htmlFor = 'issue-input'
  label.textContent = 'Issue'
  const input = document.createElement('input')
  input.id = 'issue-input'
  const textarea = document.createElement('textarea')
  dialog.append(label, input, textarea)
  document.body.append(dialog)
  if (field === 'issue') {
    input.focus()
  } else {
    textarea.focus()
  }
  return dialog
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
  activeModal = 'none'
  modalData = {}
  fixture.queryRevision = 0
  fixture.hidden = false
  fixture.staleScope = false
  fixture.state.activeView = 'activity'
  const root = document.createElement('aside')
  root.dataset.activityViewer = 'activity-page'
  const row = document.createElement('div')
  row.dataset.activityViewerThread = 't:thread'
  const trigger = document.createElement('div')
  trigger.dataset.activityPreviewTrigger = 'owner'
  trigger.dataset.state = 'open'
  trigger.setAttribute('role', 'listitem')
  row.append(trigger)
  root.append(row)
  document.body.append(root)
  portal = document.createElement('div')
  portal.dataset.activityPreviewOwner = 'owner'
  portal.dataset.activityPreviewPane = 'thread'
  portal.dataset.activityPreviewWorkspace = worktree.id
  portal.dataset.activityPreviewHost = 'local'
  portal.dataset.state = 'open'
  action = document.createElement('button')
  action.setAttribute('aria-label', 'Edit notes')
  commit = () => {
    commitModal(action.getAttribute('aria-label') === 'Edit issue' ? 'issue' : 'comment')
  }
  action.addEventListener('click', () => {
    click()
    commit()
  })
  portal.append(action)
  document.body.append(portal)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 300, 200)
  )
})
afterEach(() => {
  expect(fixture.listeners.size).toBe(0)
  document.body.replaceChildren()
  vi.restoreAllMocks()
  click.mockClear()
})
it.each(['issue', 'comment'] as const)(
  'opens original %s action once and accepts expected source occlusion after modal commit',
  async (field) => {
    action.setAttribute('aria-label', field === 'issue' ? 'Edit issue' : 'Edit notes')
    expect(await run(field)).toMatchObject({
      applied: true,
      persisted: null,
      editAction: { paneKey: 'thread', field, opened: true, focus: 'focused' }
    })
    expect(click).toHaveBeenCalledTimes(1)
  }
)
it('preserves an already open draft without dispatching another action', async () => {
  activeModal = 'edit-meta'
  modalData = { draft: 'keep' }
  await expect(run()).rejects.toThrow('activity_modal_already_open')
  expect(click).not.toHaveBeenCalled()
  expect(modalData).toEqual({ draft: 'keep' })
})
it('requires the original section action instead of creating a hidden editor', async () => {
  action.remove()
  await expect(run()).rejects.toThrow('activity_preview_edit_unavailable')
  expect(click).not.toHaveBeenCalled()
})

it('does not acknowledge a dialog resolved to another host', async () => {
  commit = () => {
    commitModal().dataset.worktreeMetaHost = 'ssh:other'
  }
  expect(await run()).toMatchObject({
    applied: false,
    editAction: { opened: false, focus: 'unverified' }
  })
})
it('waits for committed original field seeds instead of only dialog visibility', async () => {
  commit = () => {
    commitModal().dataset.worktreeMetaSeedReady = 'false'
  }
  expect(await run()).toMatchObject({ applied: false, editAction: { opened: false } })
})
it('does not acknowledge a visible editor without its requested input focus', async () => {
  commit = () => {
    commitModal()
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
  }
  expect(await run()).toMatchObject({
    applied: false,
    editAction: { opened: true, focus: 'unverified' }
  })
})
it('preserves the original disabled issue input without forcing focus', async () => {
  action.setAttribute('aria-label', 'Edit issue')
  commit = () => {
    const input = commitModal('issue').querySelector('input')
    if (input) {
      input.disabled = true
    }
  }
  expect(await run('issue')).toMatchObject({
    applied: true,
    editAction: { opened: true, focus: 'disabled' }
  })
})
it('fences modalData replacement while waiting for focus', async () => {
  commit = () => {
    commitModal()
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    queueMicrotask(() => {
      modalData = { ...modalData }
      for (const listener of fixture.listeners) {
        listener()
      }
    })
  }
  expect(await run()).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
})
it('fences a modal close and reopen while waiting for focus', async () => {
  commit = () => {
    commitModal()
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    queueMicrotask(() => {
      activeModal = 'none'
      for (const listener of fixture.listeners) {
        listener()
      }
      commitModal()
    })
  }
  expect(await run()).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
})

it('fences removal and reinsertion of the exact dialog while waiting for focus', async () => {
  commit = () => {
    const dialog = commitModal()
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    queueMicrotask(() => {
      dialog.remove()
      document.body.append(dialog)
      dialog.querySelector('textarea')?.focus()
    })
  }
  expect(await run()).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
})
