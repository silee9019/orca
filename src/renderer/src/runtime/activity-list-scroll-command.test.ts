// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { readActivityScope } from './activity-scope-preferences'
import { applyActivityViewerRequest } from './activity-viewer-bridge'
const fixture = vi.hoisted(() => ({
  listeners: new Set<() => void>(),
  queryRevision: 0,
  query: '',
  staleScope: false,
  rowTop: 50,
  stickyHeight: 0,
  collapsed: new Set<string>(),
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
    scope: {
      ...readActivityScope(fixture.state),
      filterRepoIds: fixture.staleScope ? ['stale'] : []
    },
    runtimeContextKey: getProviderRuntimeContextKey(fixture.state.settings),
    groupBy: fixture.state.agentsGroupBy,
    readFilter: 'all',
    compact: false,
    showChildAgents: true,
    querySettled: true,
    query: fixture.query,
    logicalRows: [{ kind: 'thread', key: 'row', workspaceId: 'workspace', hostId: 'local' }]
  }),
  readActivityGroupCollapseControl: () => ({
    queryRevision: fixture.queryRevision,
    collapsedKeys: fixture.collapsed
  })
}))
let root: HTMLElement
let scroll: HTMLElement
let row: HTMLElement
let nativeScroll: ReturnType<typeof vi.fn<(options: ScrollToOptions) => void>>
const run = (top = 300) =>
  applyActivityViewerRequest({
    id: 'scroll',
    expiresAt: Date.now() + 150,
    command: { viewer: 'host', surface: 'activity-page', operation: 'scroll', top }
  })
beforeEach(() => {
  fixture.queryRevision = 0
  fixture.query = ''
  fixture.staleScope = false
  fixture.rowTop = 50
  fixture.stickyHeight = 0
  fixture.state.activeView = 'activity'
  root = document.createElement('aside')
  root.dataset.activityViewer = 'activity-page'
  scroll = document.createElement('div')
  const list = document.createElement('div')
  list.dataset.activityVirtualList = ''
  row = document.createElement('div')
  row.dataset.activityViewerThread = 'row'
  list.append(row)
  scroll.append(list)
  root.append(scroll)
  document.body.append(root)
  Object.defineProperty(scroll, 'scrollHeight', { value: 1000, configurable: true })
  Object.defineProperty(scroll, 'clientHeight', { value: 200, configurable: true })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement
  ) {
    return this === row
      ? new DOMRect(0, fixture.rowTop, 300, 80)
      : this.dataset.activityStickyHeaderActive !== undefined
        ? new DOMRect(0, 0, 300, fixture.stickyHeight)
        : new DOMRect(0, 0, 300, 200)
  })
  nativeScroll = vi.fn((options: ScrollToOptions) => {
    scroll.scrollTop = Math.min(options.top ?? 0, 800)
    scroll.dispatchEvent(new Event('scroll'))
  })
  scroll.scrollTo = (options?: ScrollToOptions | number) =>
    nativeScroll(typeof options === 'number' ? { top: options } : (options ?? {}))
})
afterEach(() => {
  expect(fixture.listeners.size).toBe(0)
  document.body.replaceChildren()
  vi.restoreAllMocks()
})
it.each([
  [300, 300],
  [2000, 800]
])('uses one original native scroll for top %s', async (top, expected) => {
  expect(await run(top)).toMatchObject({
    applied: true,
    persisted: null,
    scrollAction: {
      requestedTop: top,
      targetTop: expected,
      scrollTop: expected,
      visibleRowKeys: ['row']
    }
  })
  expect(nativeScroll).toHaveBeenCalledExactlyOnceWith({ top: expected, behavior: 'instant' })
})
it('rejects a hidden list before scrolling', async () => {
  root.hidden = true
  await expect(run()).rejects.toThrow('activity_scroll_unavailable')
  expect(nativeScroll).not.toHaveBeenCalled()
})
it('rejects overscan rows that do not intersect the viewport', async () => {
  fixture.rowTop = 900
  expect(await run()).toMatchObject({ applied: false, scrollAction: { visibleRowKeys: [] } })
  expect(nativeScroll).toHaveBeenCalledTimes(1)
})
it('fences committed query changes that return before the next poll', async () => {
  nativeScroll.mockImplementation(() => {
    scroll.scrollTop = 300
    fixture.queryRevision += 2
  })
  expect(await run()).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
})

it('requires the native event after a changed offset', async () => {
  nativeScroll.mockImplementation(() => {
    scroll.scrollTop = 300
  })
  expect(await run()).toMatchObject({ applied: false })
})
it('fences view departure and return even when the same root survives', async () => {
  nativeScroll.mockImplementation(() => {
    scroll.scrollTop = 300
    fixture.state.activeView = 'terminal'
    for (const listener of fixture.listeners) {
      listener()
    }
    fixture.state.activeView = 'activity'
    for (const listener of fixture.listeners) {
      listener()
    }
    scroll.dispatchEvent(new Event('scroll'))
  })
  expect(await run()).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
})
it('does not count rows hidden behind the active sticky header', async () => {
  const header = document.createElement('div')
  header.dataset.activityStickyHeaderActive = ''
  root.append(header)
  fixture.stickyHeight = 150
  expect(await run()).toMatchObject({ applied: false, scrollAction: { visibleRowKeys: [] } })
})
it('unsubscribes after the original scroll throws', async () => {
  nativeScroll.mockImplementation(() => {
    throw new Error('scroll_failed')
  })
  await expect(run()).rejects.toThrow('scroll_failed')
})

it('rejects stale committed scope before a same-offset scroll', async () => {
  fixture.staleScope = true
  await expect(run(0)).rejects.toThrow('activity_scroll_unavailable')
  expect(nativeScroll).not.toHaveBeenCalled()
})
it('rejects a changed committed scope after a same-offset scroll', async () => {
  nativeScroll.mockImplementation(() => {
    fixture.staleScope = true
  })
  expect(await run(0)).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
})
