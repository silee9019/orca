// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  makeRepo,
  makeTabWithIds,
  makeWorktree
} from '@/components/activity/ActivityPrototypePage-test-fixtures'
import type { AgentPaneThread } from '@/components/activity/activity-thread-types'
import { translate } from '@/i18n/i18n'
import { applyActivityViewerRequest } from './activity-viewer-bridge'
const fixture = vi.hoisted(() => ({
  listeners: new Set<() => void>(),
  valid: true,
  logical: true,
  commit: true,
  pendingClose: false,
  state: {
    persistedUIReady: true,
    settings: { activeRuntimeEnvironmentId: null },
    agentsGroupBy: 'none',
    agentsReadFilter: 'all',
    agentsCompactMode: false,
    agentsShowChildAgents: true
  }
}))
let thread: AgentPaneThread
let root: HTMLElement
let portal: HTMLElement
let trigger: HTMLElement
let action: HTMLButtonElement
const keydown = vi.fn()
vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => fixture.state,
    subscribe: (listener: () => void) => {
      fixture.listeners.add(listener)
      return () => fixture.listeners.delete(listener)
    }
  }
}))
vi.mock('./activity-thread-command-target', () => ({
  captureActivityThreadCommandTarget: () => ({
    root,
    thread,
    workspaceId: thread.worktree.id,
    executionHostId: 'local',
    initial: fixture.state,
    observe: () => {},
    sameRuntime: () => true,
    stillExpected: () => fixture.valid && root.isConnected,
    stillOwned: () => fixture.logical && root.isConnected
  })
}))
vi.mock('./activity-viewer-view', () => ({ readActivityViewerView: () => null }))
const run = (enabled = true) =>
  applyActivityViewerRequest({
    id: 'issue-menu',
    expiresAt: Date.now() + 150,
    command: {
      viewer: 'host',
      surface: 'activity-page',
      operation: 'preview-issue-menu',
      paneKey: 'thread',
      enabled
    }
  })
function publishAction(open: boolean): void {
  const next = document.createElement('button')
  next.id = 'issue-trigger'
  next.setAttribute(
    'aria-label',
    translate('auto.components.sidebar.WorktreeCardMeta.moreIssueActions', 'More issue actions')
  )
  next.setAttribute('aria-expanded', String(open))
  next.dataset.state = open ? 'open' : 'closed'
  if (open) {
    next.setAttribute('aria-controls', 'issue-menu')
  }
  next.addEventListener('keydown', (event) => {
    keydown(event.key)
    if (!fixture.commit) {
      return
    }
    const enabled = next.getAttribute('aria-expanded') !== 'true'
    publishAction(enabled)
    document.getElementById('issue-menu')?.remove()
    if (enabled) {
      const menu = document.createElement('div')
      menu.id = 'issue-menu'
      menu.setAttribute('role', 'menu')
      menu.setAttribute('aria-labelledby', 'issue-trigger')
      menu.dataset.state = 'open'
      document.body.append(menu)
    } else if (fixture.pendingClose) {
      portal.remove()
      trigger.dataset.state = 'closed'
      fixture.valid = false
    }
  })
  action?.remove()
  action = next
  portal.append(next)
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
  fixture.valid = true
  fixture.logical = true
  fixture.commit = true
  fixture.pendingClose = false
  root = document.createElement('aside')
  const wrapper = document.createElement('div')
  wrapper.dataset.activityViewerThread = 't:thread'
  trigger = document.createElement('div')
  trigger.setAttribute('role', 'listitem')
  trigger.dataset.activityPreviewTrigger = 'owner'
  trigger.dataset.state = 'open'
  wrapper.append(trigger)
  root.append(wrapper)
  document.body.append(root)
  portal = document.createElement('div')
  Object.assign(portal.dataset, {
    activityPreviewOwner: 'owner',
    activityPreviewPane: 'thread',
    activityPreviewWorkspace: worktree.id,
    activityPreviewHost: 'local',
    state: 'open'
  })
  document.body.append(portal)
  publishAction(false)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 300, 200)
  )
})
afterEach(() => {
  expect(fixture.listeners.size).toBe(0)
  document.body.replaceChildren()
  vi.restoreAllMocks()
  keydown.mockReset()
})
it('opens through the original Enter handler despite its normal Tooltip trigger replacement', async () => {
  const original = action
  expect(await run()).toMatchObject({
    applied: true,
    persisted: null,
    issueMenuAction: { paneKey: 'thread', enabled: true, visible: true }
  })
  expect(action).not.toBe(original)
  expect(keydown).toHaveBeenCalledExactlyOnceWith('Enter')
})
it('does not toggle an already closed menu', async () => {
  expect(await run(false)).toMatchObject({
    applied: true,
    issueMenuAction: { enabled: false, visible: false }
  })
  expect(keydown).not.toHaveBeenCalled()
})
it('closes through original pending-hover-close without requiring the preview to remain mounted', async () => {
  await run()
  keydown.mockClear()
  fixture.pendingClose = true
  expect(await run(false)).toMatchObject({
    applied: true,
    issueMenuAction: { enabled: false, visible: false }
  })
  expect(portal.isConnected).toBe(false)
  expect(keydown).toHaveBeenCalledExactlyOnceWith('Enter')
})
it('does not accept a menu that has another trigger owner', async () => {
  action.addEventListener('keydown', () =>
    document.getElementById('issue-menu')?.setAttribute('aria-labelledby', 'other')
  )
  expect(await run()).toMatchObject({ applied: false })
})
it('does not report a missing original commit as applied', async () => {
  fixture.commit = false
  expect(await run()).toMatchObject({ applied: false })
})
it('does not toggle an already open exact menu', async () => {
  await run()
  keydown.mockClear()
  const menu = document.getElementById('issue-menu')
  expect(await run()).toMatchObject({ applied: true })
  expect(document.getElementById('issue-menu')).toBe(menu)
  expect(keydown).not.toHaveBeenCalled()
})
it('does not accept a replacement with another stable trigger id', async () => {
  action.addEventListener('keydown', () => {
    action.id = 'other'
  })
  expect(await run()).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
})
it('keeps a source owner change invalid even when immediately restored', async () => {
  action.addEventListener('keydown', () => {
    portal.dataset.activityPreviewOwner = 'other'
    portal.dataset.activityPreviewOwner = 'owner'
  })
  expect(await run()).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
})
it('keeps menu removal invalid even when the same node is immediately reinserted', async () => {
  action.addEventListener('keydown', () =>
    queueMicrotask(() => {
      const menu = document.getElementById('issue-menu')
      menu?.remove()
      if (menu) {
        document.body.append(menu)
      }
    })
  )
  expect(await run()).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
})
it('rejects disabled and ambiguous original actions before dispatch', async () => {
  action.disabled = true
  await expect(run()).rejects.toThrow('activity_preview_issue_menu_unavailable')
  action.disabled = false
  portal.append(action.cloneNode(true))
  await expect(run()).rejects.toThrow('activity_preview_issue_menu_unavailable')
  expect(keydown).not.toHaveBeenCalled()
})
it('does not accept logical owner loss after the original transition', async () => {
  action.addEventListener('keydown', () => {
    fixture.logical = false
  })
  expect(await run()).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
})
it('accepts original menu removal when an unrelated tooltip reuses its former DOM id', async () => {
  await run()
  action.addEventListener('keydown', () => {
    const tooltip = document.createElement('div')
    tooltip.id = 'issue-menu'
    tooltip.setAttribute('role', 'tooltip')
    document.body.append(tooltip)
  })
  expect(await run(false)).toMatchObject({
    applied: true,
    issueMenuAction: { enabled: false, visible: false }
  })
})
it('does not accept a pending-close preview that is reinserted before acknowledgement', async () => {
  await run()
  fixture.pendingClose = true
  action.addEventListener('keydown', () =>
    queueMicrotask(() => {
      document.body.append(portal)
      trigger.dataset.state = 'open'
      fixture.valid = true
    })
  )
  expect(await run(false)).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
})
it('accepts menu removal while the original preview retains its closed exit-animation node', async () => {
  await run()
  action.addEventListener('keydown', () => {
    portal.dataset.state = 'closed'
    trigger.dataset.state = 'closed'
  })
  expect(await run(false)).toMatchObject({
    applied: true,
    issueMenuAction: { enabled: false, visible: false }
  })
})
it('rejects a same-owner replacement preview that opens and disappears before inspection', async () => {
  await run()
  fixture.pendingClose = true
  action.addEventListener('keydown', () =>
    queueMicrotask(() => {
      const replacement = portal.cloneNode(true)
      document.body.append(replacement)
      replacement.parentNode?.removeChild(replacement)
    })
  )
  expect(await run(false)).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
})
it('keeps a preview exit reversal invalid even when it returns to closed before inspection', async () => {
  await run()
  action.addEventListener('keydown', () => {
    portal.dataset.state = 'closed'
    portal.dataset.state = 'open'
    portal.dataset.state = 'closed'
  })
  expect(await run(false)).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
})

it.each(['instant-open', 'delayed-open'])(
  'accepts a closed menu when the original Tooltip owns trigger data-state %s',
  async (tooltipState) => {
    await run()
    action.addEventListener('keydown', () => {
      action.dataset.slot = 'tooltip-trigger'
      action.dataset.state = tooltipState
    })
    expect(await run(false)).toMatchObject({
      applied: true,
      issueMenuAction: { enabled: false, visible: false }
    })
  }
)

it('accepts Tooltip focus opening between the two closed-menu acknowledgements', async () => {
  await run()
  action.addEventListener('keydown', () => {
    action.dataset.slot = 'tooltip-trigger'
    queueMicrotask(() => {
      action.dataset.state = 'instant-open'
    })
  })
  expect(await run(false)).toMatchObject({ applied: true })
})
it('rejects Tooltip-like states on an actual dropdown trigger', async () => {
  await run()
  action.addEventListener('keydown', () => {
    action.dataset.state = 'instant-open'
  })
  expect(await run(false)).toMatchObject({ applied: false })
})

it('does not toggle an already closed menu with an open Tooltip', async () => {
  action.dataset.slot = 'tooltip-trigger'
  action.dataset.state = 'instant-open'
  expect(await run(false)).toMatchObject({ applied: true })
  expect(keydown).not.toHaveBeenCalled()
})
it('rejects an invalid Tooltip state even when restored between acknowledgements', async () => {
  await run()
  action.addEventListener('keydown', () => {
    action.dataset.slot = 'tooltip-trigger'
    queueMicrotask(() => {
      action.dataset.state = 'open'
      action.dataset.state = 'closed'
    })
  })
  expect(await run(false)).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
})
it('does not treat a missing aria-expanded value as a closed menu', async () => {
  await run()
  action.addEventListener('keydown', () => {
    action.removeAttribute('aria-expanded')
  })
  expect(await run(false)).toMatchObject({ applied: false })
})
