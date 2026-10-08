// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { applyActivityViewerRequest } from './activity-viewer-bridge'

const fixture = vi.hoisted(() => {
  const emptyId = (): string | null => null
  const pending: Record<string, object> = {}
  return {
    listeners: new Set<() => void>(),
    owner: 'local',
    state: {
      persistedUIReady: true,
      settings: { activeRuntimeEnvironmentId: null },
      activeView: 'activity',
      previousViewBeforeActivity: 'settings',
      activeWorktreeId: emptyId(),
      activePendingCreationId: emptyId(),
      pendingWorktreeCreations: pending,
      agentsGroupBy: 'none',
      agentsReadFilter: 'all',
      agentsCompactMode: false,
      agentsShowChildAgents: true
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
vi.mock('@/lib/resolved-worktree-execution-host', () => ({
  getResolvedExecutionHostIdForWorktree: () => fixture.owner
}))
vi.mock('./activity-viewer-view', () => ({
  readActivityViewerView: () => ({
    runtimeContextKey: getProviderRuntimeContextKey(fixture.state.settings)
  })
}))
let source: HTMLElement
let destination: HTMLElement
let button: HTMLButtonElement
const notify = () => {
  for (const listener of fixture.listeners) {
    listener()
  }
}
const run = () =>
  applyActivityViewerRequest({
    id: 'close',
    expiresAt: Date.now() + 120,
    command: { viewer: 'host', surface: 'activity-page', operation: 'close' }
  })
beforeEach(() => {
  fixture.owner = 'local'
  Object.assign(fixture.state, {
    activeView: 'activity',
    previousViewBeforeActivity: 'settings',
    activeWorktreeId: null,
    activePendingCreationId: null,
    pendingWorktreeCreations: {},
    settings: { activeRuntimeEnvironmentId: null }
  })
  source = document.createElement('div')
  source.dataset.activityViewer = 'activity-page'
  button = document.createElement('button')
  button.dataset.activityPageClose = ''
  destination = document.createElement('div')
  document.body.append(source, button, destination)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 800, 600)
  )
  button.onclick = vi.fn(() => {
    fixture.state.activeView = fixture.state.previousViewBeforeActivity
    notify()
    source.remove()
    button.remove()
    destination.dataset.renderedActivePage = fixture.state.activeView
  })
})
afterEach(() => {
  expect(fixture.listeners.size).toBe(0)
  document.body.replaceChildren()
  vi.restoreAllMocks()
})
it('clicks the original parent once and accepts its normal source unmount', async () => {
  const click = button.onclick
  expect(await run()).toMatchObject({
    applied: true,
    persisted: null,
    pageAction: { requestedView: 'settings', reachedView: 'settings' }
  })
  expect(click).toHaveBeenCalledTimes(1)
})
it('requires a committed destination instead of only activeView', async () => {
  button.onclick = vi.fn(() => {
    fixture.state.activeView = 'settings'
    notify()
    source.remove()
  })
  expect(await run()).toMatchObject({ applied: false })
  expect(button.onclick).toHaveBeenCalledTimes(1)
})
it.each(['hidden', 'disabled', 'wrong-view'])('rejects %s before dispatch', async (kind) => {
  if (kind === 'hidden') {
    button.hidden = true
  }
  if (kind === 'disabled') {
    button.disabled = true
  }
  if (kind === 'wrong-view') {
    fixture.state.activeView = 'terminal'
  }
  await expect(run()).rejects.toThrow('activity_close_unavailable')
  expect(button.onclick).not.toHaveBeenCalled()
})
it('fences a view departure and return after arrival', async () => {
  const original = button.onclick
  button.onclick = vi.fn((event) => {
    original?.call(button, event)
    fixture.state.activeView = 'skills'
    notify()
    fixture.state.activeView = 'settings'
    notify()
  })
  expect(await run()).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
})
it('requires the exact visible terminal workspace and owner', async () => {
  fixture.state.previousViewBeforeActivity = 'terminal'
  fixture.state.activeWorktreeId = 'workspace'
  destination.dataset.renderedActiveWorktreeId = 'workspace'
  destination.dataset.renderedActiveExecutionHostId = 'other'
  expect(await run()).toMatchObject({ applied: false })
})
it('accepts a landing entry with no active workspace', async () => {
  fixture.state.previousViewBeforeActivity = 'terminal'
  expect(await run()).toMatchObject({
    applied: true,
    pageAction: { requestedView: 'terminal', reachedView: 'terminal' }
  })
})
it('does not claim a creation panel from a terminal entry marker', async () => {
  fixture.state.previousViewBeforeActivity = 'terminal'
  fixture.state.activePendingCreationId = 'pending'
  fixture.state.pendingWorktreeCreations.pending = {}
  expect(await run()).toMatchObject({ applied: false })
})

it('accepts the exact resident workspace and host after the entry commits', async () => {
  fixture.state.previousViewBeforeActivity = 'terminal'
  fixture.state.activeWorktreeId = 'workspace'
  destination.dataset.renderedActiveWorktreeId = 'workspace'
  destination.dataset.renderedActiveExecutionHostId = 'local'
  expect(await run()).toMatchObject({ applied: true })
})
it('fences a workspace owner departure and return', async () => {
  fixture.state.previousViewBeforeActivity = 'terminal'
  fixture.state.activeWorktreeId = 'workspace'
  destination.dataset.renderedActiveWorktreeId = 'workspace'
  destination.dataset.renderedActiveExecutionHostId = 'local'
  const original = button.onclick
  button.onclick = vi.fn((event) => {
    original?.call(button, event)
    fixture.owner = 'other'
    notify()
    fixture.owner = 'local'
    notify()
  })
  expect(await run()).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
})
it('waits for the actual destination commit without replaying the click', async () => {
  button.onclick = vi.fn(() => {
    fixture.state.activeView = 'settings'
    notify()
    source.remove()
    setTimeout(() => {
      destination.dataset.renderedActivePage = 'settings'
    }, 30)
  })
  expect(await run()).toMatchObject({ applied: true })
  expect(button.onclick).toHaveBeenCalledTimes(1)
})
it('cleans up the observer if the original parent throws', async () => {
  button.onclick = null
  vi.spyOn(button, 'click').mockImplementation(() => {
    throw new Error('parent_failed')
  })
  await expect(run()).rejects.toThrow('parent_failed')
})
it('rejects expiry before clicking', async () => {
  await expect(
    applyActivityViewerRequest({
      id: 'expired',
      expiresAt: Date.now() - 1,
      command: { viewer: 'host', surface: 'activity-page', operation: 'close' }
    })
  ).rejects.toThrow('request_expired')
  expect(button.onclick).not.toHaveBeenCalled()
})
