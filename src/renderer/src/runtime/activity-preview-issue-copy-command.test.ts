// @vitest-environment happy-dom
import { isActivityDestinationVisible } from './activity-workspace-destination'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  makeRepo,
  makeTabWithIds,
  makeWorktree
} from '@/components/activity/ActivityPrototypePage-test-fixtures'
import type { AgentPaneThread } from '@/components/activity/activity-thread-types'
import { translate } from '@/i18n/i18n'
import { applyActivityViewerRequest } from './activity-viewer-bridge'
import { publishActivityPreviewIssueCopyControl } from './activity-preview-issue-copy-controls'
const fixture = vi.hoisted(() => ({
  logical: true,
  runtime: true,
  listeners: new Set<() => void>(),
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
let menu: HTMLElement
let item: HTMLElement
const url = 'https://example.com/issues/7'
const write = vi.fn<(value: string) => Promise<void>>()
const read = vi.fn<() => Promise<string>>()
const copy = vi.fn<() => Promise<boolean>>()
let cleanup: () => void
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
    sameRuntime: () => fixture.runtime,
    stillExpected: () => fixture.logical && isActivityDestinationVisible(root),
    stillOwned: () => fixture.logical && root.isConnected
  })
}))
vi.mock('./activity-viewer-view', () => ({ readActivityViewerView: () => null }))
const run = () =>
  applyActivityViewerRequest({
    id: 'issue-copy',
    expiresAt: Date.now() + 200,
    command: {
      viewer: 'host',
      surface: 'activity-page',
      operation: 'preview-copy-issue-link',
      paneKey: 'thread'
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
  fixture.logical = true
  fixture.runtime = true
  root = document.createElement('aside')
  const row = document.createElement('div')
  row.dataset.activityViewerThread = 't:thread'
  trigger = document.createElement('div')
  trigger.setAttribute('role', 'listitem')
  trigger.dataset.activityPreviewTrigger = 'owner'
  trigger.dataset.state = 'open'
  row.append(trigger)
  root.append(row)
  document.body.append(root)
  portal = document.createElement('div')
  Object.assign(portal.dataset, {
    activityPreviewOwner: 'owner',
    activityPreviewPane: 'thread',
    activityPreviewWorkspace: worktree.id,
    activityPreviewHost: 'local',
    state: 'open'
  })
  action = document.createElement('button')
  action.id = 'issue-trigger'
  action.setAttribute(
    'aria-label',
    translate('auto.components.sidebar.WorktreeCardMeta.moreIssueActions', 'More issue actions')
  )
  action.setAttribute('aria-expanded', 'true')
  action.setAttribute('aria-controls', 'issue-menu')
  action.dataset.state = 'open'
  portal.append(action)
  document.body.append(portal)
  menu = document.createElement('div')
  menu.id = 'issue-menu'
  menu.setAttribute('role', 'menu')
  menu.setAttribute('aria-labelledby', action.id)
  menu.dataset.state = 'open'
  item = document.createElement('div')
  item.setAttribute('role', 'menuitem')
  item.textContent = translate('auto.components.sidebar.WorktreeCardMeta.copyLink', 'Copy link')
  menu.append(item)
  document.body.append(menu)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 300, 200)
  )
  Object.defineProperty(window, 'api', {
    value: { ui: { writeClipboardText: write, readClipboardText: read } },
    configurable: true
  })
  write.mockResolvedValue()
  read.mockResolvedValue(url)
  copy.mockImplementation(async () => {
    portal.remove()
    menu.remove()
    trigger.dataset.state = 'closed'
    await write(url)
    return true
  })
  cleanup = publishActivityPreviewIssueCopyControl(portal, { url, copy })
})
afterEach(() => {
  cleanup()
  expect(fixture.listeners.size).toBe(0)
  document.body.replaceChildren()
  vi.restoreAllMocks()
  copy.mockReset()
  read.mockReset()
  write.mockReset()
})
it('uses the original callback once, accepts its close, and verifies clipboard bytes without returning the URL', async () => {
  const result = await run()
  expect(result).toMatchObject({
    applied: true,
    persisted: null,
    writeOutcome: 'not_requested',
    copyAction: { paneKey: 'thread', kind: 'issue-link', writeAcknowledged: true, verified: true }
  })
  expect(copy).toHaveBeenCalledTimes(1)
  expect(write).toHaveBeenCalledExactlyOnceWith(url)
  expect(read).toHaveBeenCalledTimes(1)
  expect(portal.isConnected).toBe(false)
  expect(menu.isConnected).toBe(false)
  expect(JSON.stringify(result)).not.toContain(url)
})
it('accepts publication cleanup caused by the original close', async () => {
  write.mockImplementation(async () => {
    cleanup()
  })
  expect(await run()).toMatchObject({ applied: true })
})
it.each([
  'closed',
  'foreign-menu',
  'disabled-item',
  'duplicate-item',
  'missing-publication',
  'foreign-host'
])('rejects %s before copying', async (condition) => {
  if (condition === 'closed') {
    action.setAttribute('aria-expanded', 'false')
  }
  if (condition === 'foreign-menu') {
    menu.setAttribute('aria-labelledby', 'other')
  }
  if (condition === 'disabled-item') {
    item.setAttribute('aria-disabled', 'true')
  }
  if (condition === 'duplicate-item') {
    menu.append(item.cloneNode(true))
  }
  if (condition === 'missing-publication') {
    cleanup()
  }
  if (condition === 'foreign-host') {
    portal.dataset.activityPreviewHost = 'ssh:other'
  }
  await expect(run()).rejects.toThrow()
  expect(copy).not.toHaveBeenCalled()
  expect(write).not.toHaveBeenCalled()
})
it('does not accept a read-back mismatch as applied', async () => {
  read.mockResolvedValue('different')
  expect(await run()).toMatchObject({
    applied: false,
    copyAction: { writeAcknowledged: true, verified: false }
  })
})
it('does not retry or read after a rejected clipboard write', async () => {
  write.mockRejectedValue(new Error('denied'))
  expect(await run()).toMatchObject({
    applied: false,
    copyAction: { writeAcknowledged: false, verified: false }
  })
  expect(copy).toHaveBeenCalledTimes(1)
  expect(read).not.toHaveBeenCalled()
})
it('fences logical owner loss during the original copy', async () => {
  write.mockImplementation(async () => {
    fixture.logical = false
  })
  expect(await run()).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
  expect(read).not.toHaveBeenCalled()
})
it('fences runtime replacement during the original copy', async () => {
  write.mockImplementation(async () => {
    fixture.runtime = false
  })
  expect(await run()).toMatchObject({ applied: false, reason: 'viewer_runtime_changed' })
})
it('rejects original preview reinsertion before acknowledgement', async () => {
  write.mockImplementation(async () => {
    document.body.append(portal)
  })
  expect(await run()).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
})
it('rejects a transient same-owner preview replacement', async () => {
  write.mockImplementation(async () => {
    const next = portal.cloneNode(true)
    document.body.append(next)
    next.parentNode?.removeChild(next)
  })
  expect(await run()).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
})
it('rejects original menu reinsertion before acknowledgement', async () => {
  write.mockImplementation(async () => {
    document.body.append(menu)
  })
  expect(await run()).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
})
it('does not claim a missing original close as applied', async () => {
  copy.mockImplementation(async () => {
    await write(url)
    return true
  })
  expect(await run()).toMatchObject({ applied: false, copyAction: { writeAcknowledged: true } })
})
it('rejects a lease that changed while its preview remains open', async () => {
  copy.mockImplementation(async () => {
    cleanup()
    const next = publishActivityPreviewIssueCopyControl(portal, { url, copy })
    next()
    await write(url)
    return true
  })
  expect(await run()).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
})
it('does not read after the original copy times out', async () => {
  write.mockImplementation(() => new Promise(() => {}))
  expect(await run()).toMatchObject({
    applied: false,
    copyAction: { writeAcknowledged: false, verified: false }
  })
  expect(read).not.toHaveBeenCalled()
  expect(copy).toHaveBeenCalledTimes(1)
})

it('rejects a copy item clipped outside its menu viewport before any write', async () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement
  ) {
    return this === item ? new DOMRect(0, 400, 20, 20) : new DOMRect(0, 0, 300, 200)
  })
  await expect(run()).rejects.toThrow('activity_preview_issue_copy_unavailable')
  expect(copy).not.toHaveBeenCalled()
})
it('keeps owner departure and return invalid during the write', async () => {
  write.mockImplementation(async () => {
    portal.dataset.activityPreviewHost = 'ssh:other'
    portal.dataset.activityPreviewHost = 'local'
  })
  expect(await run()).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
})
it('keeps transient original-menu reinsertion invalid', async () => {
  write.mockImplementation(async () => {
    document.body.append(menu)
    menu.remove()
  })
  expect(await run()).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
})

it('does not report applied when its surface becomes hidden during clipboard read-back', async () => {
  read.mockImplementation(async () => {
    root.hidden = true
    return url
  })
  expect(await run()).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
})
