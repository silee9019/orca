import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { applyActivityViewerRequest } from './activity-viewer-bridge'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'

const fixture = vi.hoisted(() => ({
  visible: true,
  available: true,
  unread: true,
  committedUnread: true,
  run: vi.fn(),
  state: {
    persistedUIReady: true,
    settings: { activeRuntimeEnvironmentId: null },
    agentsGroupBy: 'none',
    agentsReadFilter: 'all',
    agentsCompactMode: false,
    agentsShowChildAgents: true
  }
}))
vi.mock('@/store', () => ({ useAppStore: { getState: () => fixture.state } }))
vi.mock('./activity-viewer-view', () => ({
  readActivityMarkAllReadControl: () =>
    fixture.available ? { markAllRead: fixture.run, hasUnreadThreads: fixture.unread } : null,
  readActivityViewerView: (surface: string) =>
    fixture.visible
      ? {
          surface,
          runtimeContextKey: getProviderRuntimeContextKey(fixture.state.settings),
          groupBy: fixture.state.agentsGroupBy,
          readFilter: fixture.state.agentsReadFilter,
          compact: false,
          showChildAgents: true,
          selectedPaneKey: null,
          querySettled: true,
          query: 'read thread',
          hasUnreadThreads: fixture.committedUnread,
          densityMeasured: false,
          logicalRows: [],
          renderedRows: []
        }
      : null
}))
const request = () =>
  applyActivityViewerRequest({
    id: 'mark-all',
    expiresAt: Date.now() + 150,
    command: { viewer: 'host', surface: 'activity-page', operation: 'mark-all-read' }
  })
beforeEach(() => {
  Object.assign(fixture, {
    visible: true,
    available: true,
    unread: true,
    committedUnread: true,
    run: vi.fn()
  })
  fixture.run.mockImplementation(() => {
    fixture.unread = false
    queueMicrotask(() => {
      fixture.committedUnread = false
    })
  })
  vi.stubGlobal('window', { api: { ui: { get: vi.fn(), set: vi.fn() } } })
})
afterEach(() => {
  vi.unstubAllGlobals()
})
it('invokes the original badge-coherent parent once and waits for the committed unread flag', async () => {
  expect(await request()).toMatchObject({
    applied: true,
    dispatched: true,
    persisted: null,
    writeOutcome: 'not_requested',
    rendered: { hasUnreadThreads: false, query: 'read thread' }
  })
  expect(fixture.run).toHaveBeenCalledTimes(1)
  expect(window.api.ui.get).not.toHaveBeenCalled()
  expect(window.api.ui.set).not.toHaveBeenCalled()
})
it('keeps the original disabled control a no-op', async () => {
  fixture.unread = false
  fixture.committedUnread = false
  expect(await request()).toMatchObject({ applied: true, dispatched: false, persisted: null })
  expect(fixture.run).not.toHaveBeenCalled()
})
it('rejects a missing surface or callback before invoking the parent', async () => {
  fixture.visible = false
  await expect(request()).rejects.toThrow('activity_surface_unavailable')
  fixture.visible = true
  fixture.available = false
  await expect(request()).rejects.toThrow('activity_read_control_unavailable')
  expect(fixture.run).not.toHaveBeenCalled()
})
it('does not claim application while the committed unread set remains unchanged', async () => {
  fixture.run.mockImplementation(() => {
    fixture.unread = false
  })
  expect(await request()).toMatchObject({
    applied: false,
    dispatched: true,
    persisted: null,
    reason: 'viewer_not_applied'
  })
})
it('fences a replacement callback instead of invoking the new owner', async () => {
  const original = fixture.run
  original.mockImplementation(() => {
    fixture.run = vi.fn()
  })
  expect(await request()).toMatchObject({
    applied: false,
    reason: 'viewer_surface_superseded'
  })
  expect(original).toHaveBeenCalledTimes(1)
  expect(fixture.run).not.toHaveBeenCalled()
})
