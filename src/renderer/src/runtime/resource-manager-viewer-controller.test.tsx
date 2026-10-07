// @vitest-environment happy-dom
import React, { act, useLayoutEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { useResourceUsageStatusController } from '../components/status-bar/use-resource-usage-status-controller'
import {
  applyResourceManagerViewerAction,
  attachResourceManagerViewerController
} from './resource-manager-viewer-actions'
vi.mock('../store', () => {
  const state = {
    memorySnapshot: null,
    memorySnapshotError: null,
    fetchMemorySnapshot: vi.fn(async () => {}),
    workspaceSessionReady: true,
    setActiveView: vi.fn(),
    openModal: vi.fn(),
    openSpacePage: vi.fn(),
    recordFeatureInteraction: vi.fn(),
    activeView: 'terminal',
    activeWorktreeId: null,
    workspaceSpaceAnalysis: null,
    workspaceSpaceScanning: false,
    tabsByWorktree: {},
    ptyIdsByTabId: {},
    terminalLayoutsByTabId: {},
    deferredSshSessionIdsByTabId: {},
    runtimePaneTitlesByTabId: {},
    browserTabsByWorktree: {},
    repos: [],
    folderWorkspaces: [],
    projectGroups: [],
    worktreesByRepo: {},
    unifiedTabsByWorktree: {}
  }
  return {
    useAppStore: Object.assign((selector: (s: typeof state) => unknown) => selector(state), {
      getState: () => state
    })
  }
})
vi.mock('../components/status-bar/use-resource-session-inventory', () => ({
  useResourceSessionInventory: () => ({
    sessionInventory: { count: 0, sessions: [] },
    sessionsError: false,
    refreshSessions: vi.fn(async () => {}),
    clearSessionsError: vi.fn(),
    removeSession: vi.fn(),
    removeSessions: vi.fn()
  })
}))
vi.mock('../components/status-bar/use-resource-usage-derived-model', () => ({
  useResourceUsageDerivedModel: () => ({
    unifiedRepos: [],
    daemonUnreachable: false,
    sessionsOnlyError: false
  })
}))
vi.mock('../components/status-bar/use-resource-usage-actions', () => ({
  useResourceUsageActions: () => ({})
}))
vi.mock('../components/shared/useDaemonActions', () => ({
  useDaemonActions: () => ({ pending: null, isBusy: false })
}))
vi.mock('../components/shared/kill-all-terminal-surfaces', () => ({
  snapshotKillAllTerminalSurfaceIds: () => []
}))
vi.mock('../components/status-bar/mergeSnapshotAndSessions', () => ({
  UNATTRIBUTED_REPO_ID: 'unattributed'
}))
it('registers the real hook setters, reads their committed state and unregisters on unmount', async () => {
  const container = document.createElement('div')
  const root = createRoot(container)
  function Harness(): React.JSX.Element {
    const controller = useResourceUsageStatusController()
    useLayoutEffect(() => attachResourceManagerViewerController(controller), [controller])
    return <span>{`${controller.open}:${controller.sortOption}:${controller.appCollapsed}`}</span>
  }
  await act(async () => root.render(<Harness />))
  expect(container.textContent).toBe('false:memory:true')
  await act(async () => {
    await applyResourceManagerViewerAction({ action: 'set-sort', sort: 'name' })
  })
  await act(async () => {
    await applyResourceManagerViewerAction({ action: 'set-app-collapsed', collapsed: false })
  })
  await act(async () => {
    await applyResourceManagerViewerAction({ action: 'set-open', open: true })
  })
  expect(container.textContent).toBe('true:name:false')
  expect(await applyResourceManagerViewerAction({ action: 'status' })).toMatchObject({
    open: true,
    sort: 'name',
    appCollapsed: false
  })
  await act(async () => root.unmount())
  await expect(applyResourceManagerViewerAction({ action: 'status' })).rejects.toThrow(
    'resource_manager_unavailable'
  )
})
