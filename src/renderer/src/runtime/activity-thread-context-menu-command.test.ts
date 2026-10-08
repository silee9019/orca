// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  makeRepo,
  makeTabWithIds,
  makeWorktree
} from '@/components/activity/ActivityPrototypePage-test-fixtures'
import type { AgentPaneThread } from '@/components/activity/activity-thread-types'
import { publishActivityContextMenuControl } from './activity-context-menu-controls'
import { applyActivityViewerRequest } from './activity-viewer-bridge'
const fixture = vi.hoisted(() => ({
  listeners: new Set<() => void>(),
  valid: true,
  commit: true,
  state: {
    persistedUIReady: true,
    settings: { activeRuntimeEnvironmentId: null },
    agentsGroupBy: 'none',
    agentsReadFilter: 'all',
    agentsCompactMode: false,
    agentsShowChildAgents: true
  }
}))
let root: HTMLElement
let trigger: HTMLElement
let scroll: HTMLElement
let thread: AgentPaneThread
const contextmenu = vi.fn()
const close = vi.fn()
let release: (() => void) | null = null
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
    stillExpected: () => fixture.valid && root.isConnected && !root.hidden,
    stillOwned: () => fixture.valid
  })
}))
vi.mock('./activity-viewer-view', () => ({ readActivityViewerView: () => null }))
const run = (enabled = true) =>
  applyActivityViewerRequest({
    id: 'context',
    expiresAt: Date.now() + 100,
    command: {
      viewer: 'host',
      surface: 'activity-page',
      operation: 'context-menu',
      paneKey: 'thread',
      enabled
    }
  })
function menu(): HTMLElement | null {
  return document.querySelector('[data-activity-context-owner]')
}
beforeEach(() => {
  fixture.valid = true
  fixture.commit = true
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
  root = document.createElement('aside')
  scroll = document.createElement('div')
  const list = document.createElement('div')
  list.dataset.activityVirtualList = ''
  const row = document.createElement('div')
  row.dataset.activityViewerThread = 't:thread'
  trigger = document.createElement('div')
  Object.assign(trigger.dataset, {
    slot: 'context-menu-trigger',
    activityContextTrigger: 'owner',
    activityContextPane: 'thread',
    activityContextWorkspace: worktree.id,
    state: 'closed'
  })
  row.append(trigger)
  list.append(row)
  scroll.append(list)
  root.append(scroll)
  document.body.append(root)
  trigger.addEventListener('contextmenu', (event) => {
    contextmenu(event)
    if (!fixture.commit) {
      return
    }
    trigger.dataset.state = 'open'
    const content = document.createElement('div')
    content.tabIndex = -1
    content.setAttribute('role', 'menu')
    Object.assign(content.dataset, {
      activityContextOwner: 'owner',
      activityContextPane: 'thread',
      activityContextWorkspace: worktree.id,
      activityContextTargets: JSON.stringify(['thread', 'second']),
      state: 'open'
    })
    document.body.append(content)
    content.focus()
    release = publishActivityContextMenuControl(content, () => {
      close()
      if (fixture.commit) {
        trigger.dataset.state = 'closed'
        content.remove()
        release?.()
        release = null
      }
    })
  })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 300, 200)
  )
})
afterEach(() => {
  expect(fixture.listeners.size).toBe(0)
  release?.()
  release = null
  document.body.replaceChildren()
  vi.restoreAllMocks()
  contextmenu.mockReset()
  close.mockReset()
})
it('uses one original right-click and reads its committed selection snapshot', async () => {
  expect(await run()).toMatchObject({
    applied: true,
    contextMenuAction: {
      paneKey: 'thread',
      enabled: true,
      visible: true,
      targetPaneKeys: ['thread', 'second']
    }
  })
  expect(contextmenu).toHaveBeenCalledTimes(1)
  expect(contextmenu.mock.calls[0][0]).toMatchObject({
    type: 'contextmenu',
    button: 2,
    clientX: 150,
    clientY: 100
  })
})
it('does not recompute an already open snapshot', async () => {
  await run()
  contextmenu.mockClear()
  expect(await run()).toMatchObject({ applied: true })
  expect(contextmenu).not.toHaveBeenCalled()
})
it('does not dispatch an already closed menu', async () => {
  expect(await run(false)).toMatchObject({
    applied: true,
    contextMenuAction: { visible: false, targetPaneKeys: [] }
  })
  expect(contextmenu).not.toHaveBeenCalled()
})
it('does not claim a missing commit', async () => {
  fixture.commit = false
  expect(await run()).toMatchObject({ applied: false })
})
it.each(['owner', 'pane', 'workspace'])(
  'rejects source %s mismatch before dispatch',
  async (field) => {
    trigger.setAttribute(`data-activity-context-${field === 'owner' ? 'trigger' : field}`, 'other')
    if (field === 'owner') {
      trigger.removeAttribute('data-activity-context-trigger')
    }
    await expect(run()).rejects.toThrow('activity_context_menu_unavailable')
    expect(contextmenu).not.toHaveBeenCalled()
  }
)
it('rejects an ambiguous original trigger', async () => {
  trigger.parentElement?.append(trigger.cloneNode(true))
  await expect(run()).rejects.toThrow('activity_context_menu_unavailable')
  expect(contextmenu).not.toHaveBeenCalled()
})
it('rejects a clipped trigger', async () => {
  vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(function (
    this: HTMLElement
  ) {
    return this === trigger ? new DOMRect(0, 400, 50, 20) : new DOMRect(0, 0, 300, 200)
  })
  await expect(run()).rejects.toThrow('activity_context_menu_unavailable')
  expect(contextmenu).not.toHaveBeenCalled()
})
it('uses the viewport intersection including its sticky header', async () => {
  const sticky = document.createElement('div')
  sticky.dataset.activityStickyHeaderActive = ''
  root.append(sticky)
  vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(function (
    this: HTMLElement
  ) {
    return this === sticky ? new DOMRect(0, 0, 300, 80) : new DOMRect(0, 0, 300, 200)
  })
  expect(await run()).toMatchObject({ applied: true })
  expect(contextmenu.mock.calls[0][0]).toMatchObject({ clientY: 140 })
})
it.each([
  'activityContextOwner',
  'activityContextPane',
  'activityContextWorkspace',
  'activityContextTargets'
])('rejects changed menu %s', async (field) => {
  trigger.addEventListener('contextmenu', () => {
    const content = menu()
    if (content) {
      content.dataset[field] = 'other'
    }
  })
  expect(await run()).toMatchObject({ applied: false })
})
it('rejects duplicate snapshot keys', async () => {
  trigger.addEventListener('contextmenu', () => {
    menu()?.setAttribute('data-activity-context-targets', JSON.stringify(['thread', 'thread']))
  })
  expect(await run()).toMatchObject({ applied: false })
})
it('rejects a snapshot that omits its anchor', async () => {
  trigger.addEventListener('contextmenu', () => {
    menu()?.setAttribute('data-activity-context-targets', JSON.stringify(['second']))
  })
  expect(await run()).toMatchObject({ applied: false })
})
it('keeps source owner change-return invalid', async () => {
  trigger.addEventListener('contextmenu', () => {
    trigger.dataset.activityContextTrigger = 'other'
    trigger.dataset.activityContextTrigger = 'owner'
  })
  expect(await run()).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
})
it('rejects source removal and reinsertion', async () => {
  trigger.addEventListener('contextmenu', () => {
    const parent = trigger.parentElement
    trigger.remove()
    parent?.append(trigger)
  })
  expect(await run()).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
})
it('rejects a menu removal and reinsertion between acknowledgements', async () => {
  trigger.addEventListener('contextmenu', () =>
    queueMicrotask(() => {
      const content = menu()
      content?.remove()
      if (content) {
        document.body.append(content)
      }
    })
  )
  expect(await run()).toMatchObject({ applied: false })
})
it('rejects root hiding during the original commit', async () => {
  trigger.addEventListener('contextmenu', () => {
    root.hidden = true
  })
  expect(await run()).toMatchObject({ applied: false })
})
it('rejects logical owner loss during the original commit', async () => {
  trigger.addEventListener('contextmenu', () => {
    fixture.valid = false
  })
  expect(await run()).toMatchObject({ applied: false })
})

it('closes once through the exact original callback and allows normal lease cleanup', async () => {
  await run()
  expect(await run(false)).toMatchObject({
    applied: true,
    contextMenuAction: { enabled: false, visible: false, targetPaneKeys: ['thread', 'second'] }
  })
  expect(close).toHaveBeenCalledTimes(1)
  expect(contextmenu).toHaveBeenCalledTimes(1)
})
it('does not dispatch document Escape while closing', async () => {
  await run()
  const escape = vi.fn()
  document.addEventListener('keydown', escape)
  try {
    expect(await run(false)).toMatchObject({ applied: true })
    expect(escape).not.toHaveBeenCalled()
  } finally {
    document.removeEventListener('keydown', escape)
  }
})
it('rejects lost original focus before close', async () => {
  await run()
  const input = document.createElement('input')
  document.body.append(input)
  input.focus()
  await expect(run(false)).rejects.toThrow('activity_context_menu_unavailable')
  expect(close).not.toHaveBeenCalled()
  expect(menu()?.isConnected).toBe(true)
})
it.each(['dialog', 'menu', 'listbox'])('preserves an unrelated open %s on close', async (role) => {
  await run()
  const overlay = document.createElement('div')
  overlay.setAttribute('role', role)
  document.body.append(overlay)
  await expect(run(false)).rejects.toThrow('activity_context_menu_unavailable')
  expect(overlay.isConnected).toBe(true)
  expect(close).not.toHaveBeenCalled()
})
it('rejects an expired menu lease before close', async () => {
  await run()
  release?.()
  await expect(run(false)).rejects.toThrow('activity_context_menu_unavailable')
  expect(close).not.toHaveBeenCalled()
})
it('rejects overlapping menu leases without reviving the old lease', async () => {
  await run()
  const content = menu()
  if (!content) {
    throw new Error('missing fixture menu')
  }
  const second = publishActivityContextMenuControl(content, vi.fn())
  await expect(run(false)).rejects.toThrow('activity_context_menu_unavailable')
  second()
  await expect(run(false)).rejects.toThrow('activity_context_menu_unavailable')
  expect(close).not.toHaveBeenCalled()
})
it('does not claim a missing original close commit', async () => {
  await run()
  fixture.commit = false
  expect(await run(false)).toMatchObject({ applied: false })
  expect(close).toHaveBeenCalledTimes(1)
})
it('keeps detached owner change-return invalid after close', async () => {
  await run()
  const content = menu()
  close.mockImplementationOnce(() => {
    queueMicrotask(() => {
      if (content) {
        content.dataset.activityContextOwner = 'other'
        content.dataset.activityContextOwner = 'owner'
      }
    })
  })
  expect(await run(false)).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
})
it('rejects closed-menu reinsertion', async () => {
  await run()
  const content = menu()
  close.mockImplementationOnce(() =>
    queueMicrotask(() => {
      if (content) {
        document.body.append(content)
      }
    })
  )
  expect(await run(false)).toMatchObject({ applied: false })
})
it('rejects a hidden root after expected menu removal', async () => {
  await run()
  close.mockImplementationOnce(() => {
    root.hidden = true
  })
  expect(await run(false)).toMatchObject({ applied: false })
})
it('does not recalculate its snapshot after a selection update', async () => {
  await run()
  const content = menu()
  const snapshot = content?.dataset.activityContextTargets
  expect(await run()).toMatchObject({
    applied: true,
    contextMenuAction: { targetPaneKeys: ['thread', 'second'] }
  })
  expect(content?.dataset.activityContextTargets).toBe(snapshot)
})
it('rejects source state reversal even when it returns to the expected state', async () => {
  trigger.addEventListener('contextmenu', () => {
    trigger.dataset.state = 'closed'
    trigger.dataset.state = 'open'
  })
  expect(await run()).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
})

it.each(['hidden', 'inert', 'aria-hidden', 'style', 'class'])(
  'keeps source ancestor visibility %s leave-return invalid',
  async (attribute) => {
    trigger.addEventListener('contextmenu', () => {
      root.setAttribute(
        attribute,
        attribute === 'aria-hidden'
          ? 'true'
          : attribute === 'style'
            ? 'display:none'
            : attribute === 'class'
              ? 'hidden'
              : ''
      )
      root.removeAttribute(attribute)
    })
    expect(await run()).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
  }
)

it('accepts the original menu positioning style update while source visibility stays fixed', async () => {
  const observe = MutationObserver.prototype.observe
  // happy-dom drops ancestor style records when this observer also watches the node narrowly.
  vi.spyOn(MutationObserver.prototype, 'observe').mockImplementation(function (
    this: MutationObserver,
    target,
    options
  ) {
    observe.call(
      this,
      target,
      target instanceof HTMLElement && target.hasAttribute('data-activity-context-owner')
        ? { ...options, attributeFilter: [...(options?.attributeFilter ?? []), 'style'] }
        : options
    )
  })
  trigger.addEventListener('contextmenu', () =>
    queueMicrotask(() => menu()?.setAttribute('style', 'outline: none'))
  )
  expect(await run()).toMatchObject({ applied: true })
})
