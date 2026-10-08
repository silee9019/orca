import { beforeEach, expect, it, vi } from 'vitest'
import type { SidebarViewerSnapshot } from '../../../shared/sidebar-viewer-command'
import { applySidebarViewerRequest } from './sidebar-viewer-bridge'
const fixture = vi.hoisted(() => {
  const state: {
    settings: { activeRuntimeEnvironmentId: string | null }
    activeWorktreeId: string | null
    persistedUIReady: boolean
    sidebarOpen: boolean
    rightSidebarOpen: boolean
    rightSidebarTab: string
    rightSidebarExplorerView: 'files' | 'search'
  } = {
    settings: { activeRuntimeEnvironmentId: null },
    activeWorktreeId: 'a',
    persistedUIReady: true,
    sidebarOpen: true,
    rightSidebarOpen: false,
    rightSidebarTab: 'explorer',
    rightSidebarExplorerView: 'files'
  }
  const rendered: SidebarViewerSnapshot = {
    leftMounted: true,
    leftVisible: true,
    rightMounted: true,
    rightVisible: false,
    panel: null,
    explorerView: null,
    panelReady: false,
    availablePanels: ['explorer', 'source-control', 'checks']
  }
  return { state, rendered, dispatch: vi.fn() }
})
vi.mock('@/store', () => ({ useAppStore: { getState: () => fixture.state } }))
vi.mock('@/lib/app-command-dispatch', () => ({ dispatchAppCommand: fixture.dispatch }))
vi.mock('./sidebar-viewer-view', () => ({
  readSidebarViewerView: () => fixture.rendered,
  waitForSidebarViewerView: async (matches: (value: typeof fixture.rendered) => boolean) => {
    await Promise.resolve()
    return matches(fixture.rendered)
  }
}))
beforeEach(() => {
  vi.clearAllMocks()
  fixture.state.settings.activeRuntimeEnvironmentId = null
  fixture.state.sidebarOpen = true
  fixture.state.rightSidebarOpen = false
  fixture.state.rightSidebarTab = 'explorer'
  fixture.state.rightSidebarExplorerView = 'files'
  Object.assign(fixture.rendered, {
    leftMounted: true,
    leftVisible: true,
    rightMounted: true,
    rightVisible: false,
    panel: null,
    explorerView: null,
    panelReady: false
  })
  fixture.dispatch.mockReturnValue(false)
})
it('uses the existing sidebar dispatcher and acknowledges its rendered change', async () => {
  fixture.dispatch.mockImplementation(() => {
    fixture.state.sidebarOpen = false
    return true
  })
  const result = applySidebarViewerRequest({
    id: 'left',
    expiresAt: Date.now() + 9000,
    command: { viewer: 'host', operation: 'toggle', side: 'left' }
  })
  fixture.rendered.leftVisible = false
  expect(await result).toMatchObject({
    applied: true,
    dispatched: true,
    sidebarOpen: false,
    persisted: null
  })
  expect(fixture.dispatch).toHaveBeenCalledWith('sidebar.left.toggle', 'cli')
})
it('does not acknowledge a requested tab before the actual panel content is ready', async () => {
  fixture.dispatch.mockImplementation(() => {
    fixture.state.rightSidebarOpen = true
    fixture.state.rightSidebarTab = 'checks'
    return true
  })
  fixture.rendered.rightVisible = true
  fixture.rendered.panel = 'checks'
  const result = await applySidebarViewerRequest({
    id: 'checks',
    expiresAt: Date.now() + 9000,
    command: { viewer: 'host', operation: 'open-panel', panel: 'checks' }
  })
  expect(result).toMatchObject({ applied: false, reason: 'viewer_not_applied' })
})
it('refuses unavailable panels and keeps the existing shortcut guards', async () => {
  await expect(
    applySidebarViewerRequest({
      id: 'ports',
      expiresAt: Date.now() + 9000,
      command: { viewer: 'host', operation: 'open-panel', panel: 'ports' }
    })
  ).rejects.toThrow('sidebar_panel_unavailable')
  expect(fixture.dispatch).not.toHaveBeenCalled()
  await expect(
    applySidebarViewerRequest({
      id: 'guarded',
      expiresAt: Date.now() + 9000,
      command: { viewer: 'host', operation: 'open-panel', panel: 'search' }
    })
  ).rejects.toThrow('sidebar_command_unavailable')
  expect(fixture.state.rightSidebarOpen).toBe(false)
})
it('fences runtime changes instead of acknowledging another host', async () => {
  fixture.dispatch.mockImplementation(() => {
    fixture.state.sidebarOpen = false
    return true
  })
  const result = applySidebarViewerRequest({
    id: 'runtime',
    expiresAt: Date.now() + 9000,
    command: { viewer: 'host', operation: 'toggle', side: 'left' }
  })
  fixture.state.settings.activeRuntimeEnvironmentId = 'another-host'
  fixture.rendered.leftVisible = false
  expect(await result).toMatchObject({ applied: false, reason: 'viewer_runtime_changed' })
})

it('ignores the explorer view reset when another panel owns the route', async () => {
  fixture.state.rightSidebarExplorerView = 'search'
  fixture.dispatch.mockImplementation(() => {
    fixture.state.rightSidebarOpen = true
    fixture.state.rightSidebarTab = 'checks'
    return true
  })
  const result = applySidebarViewerRequest({
    id: 'route',
    expiresAt: Date.now() + 9000,
    command: { viewer: 'host', operation: 'open-panel', panel: 'checks' }
  })
  fixture.state.rightSidebarExplorerView = 'files'
  Object.assign(fixture.rendered, { rightVisible: true, panel: 'checks', panelReady: true })
  expect(await result).toMatchObject({ applied: true, rightSidebarTab: 'checks' })
})
