import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { getDefaultSettings } from '../../../shared/constants'
import { installClientHostedPaneApi } from './browser-pane/client-hosted-browser-pane-test-rig'
import { makeFolderWorkspace } from '../store/slices/worktrees-slice-test-fixtures'
import { replaceRuntimeEnvironmentRevisions } from '@/runtime/runtime-environment-revision'
import {
  setHostSessionTabIdMapping,
  clearHostSessionTabIdMappings
} from '@/runtime/web-session-tabs-sync/tracking-mappings'
import { TerminalTitlebarTabs, type TerminalTitlebarController } from './TerminalTitlebarTabs'
import { useTerminalActivationActions } from './use-terminal-activation-actions'
import type { BrowserTitlebarPairedActivationTarget } from '../../../shared/rpc-contract/browser-titlebar-paired-activation-params'
export const titlebarEnvironment = 'paired-titlebar-fixture'
export const titlebarWorktree = 'folder:titlebar'
export function seedPairedTitlebarTarget(): BrowserTitlebarPairedActivationTarget {
  installClientHostedPaneApi()
  useAppStore.setState({
    settings: getDefaultSettings('/fixture'),
    persistedUIReady: true,
    activeWorktreeId: titlebarWorktree,
    activeModal: 'none',
    activeView: 'terminal',
    activeWorkspaceExecutionHostId: 'local',
    folderWorkspaces: [makeFolderWorkspace({ id: 'titlebar', executionHostId: 'local' })]
  })
  const workspace = useAppStore
    .getState()
    .createBrowserTab(titlebarWorktree, 'https://first.test/', {
      browserPageId: 'titlebar-page',
      browserRuntimeEnvironmentId: null
    })
  useAppStore.getState().createBrowserTab(titlebarWorktree, 'https://second.test/', {
    browserRuntimeEnvironmentId: null
  })
  const item = useAppStore
    .getState()
    .unifiedTabsByWorktree[titlebarWorktree]?.find((tab) => tab.entityId === workspace.id)
  if (!item) {
    throw new Error('missing titlebar unified tab')
  }
  const executionHostId = `runtime:${titlebarEnvironment}` as const
  useAppStore.setState((state) => ({
    settings: {
      ...getDefaultSettings('/fixture'),
      activeRuntimeEnvironmentId: titlebarEnvironment
    },
    activeWorkspaceExecutionHostId: executionHostId,
    folderWorkspaces: [makeFolderWorkspace({ id: 'titlebar', executionHostId })],
    browserPagesByWorkspace: Object.fromEntries(
      Object.entries(state.browserPagesByWorkspace).map(([id, pages]) => [
        id,
        pages.map((page) => ({ ...page, browserRuntimeEnvironmentId: titlebarEnvironment }))
      ])
    ),
    remoteBrowserPageHandlesByPageId: {
      'titlebar-page': {
        environmentId: titlebarEnvironment,
        remotePageId: 'host-page',
        placement: { kind: 'server' }
      }
    }
  }))
  replaceRuntimeEnvironmentRevisions([
    { id: titlebarEnvironment, createdAt: 7, pairingRevision: 7 }
  ])
  setHostSessionTabIdMapping(
    { environmentId: titlebarEnvironment, worktreeId: titlebarWorktree, tabId: workspace.id },
    'host-tab'
  )
  return {
    worktree: titlebarWorktree,
    workspace: workspace.id,
    unifiedTab: item.id,
    group: item.groupId,
    page: 'titlebar-page',
    remotePageId: 'host-page',
    hostTabId: 'host-tab',
    environmentId: titlebarEnvironment,
    executionHostId,
    pairingRevision: 7,
    placement: { kind: 'server' }
  }
}
export function clearPairedTitlebarTarget(): void {
  clearHostSessionTabIdMappings(titlebarEnvironment, titlebarWorktree)
  replaceRuntimeEnvironmentRevisions([])
}
export function PairedTitlebarFixture({
  portal,
  visible = true
}: {
  portal: HTMLElement
  visible?: boolean
}) {
  const state = useAppStore(
    useShallow((state) => ({
      setActiveBrowserTab: state.setActiveBrowserTab,
      setActiveTab: state.setActiveTab,
      setActiveTabType: state.setActiveTabType,
      activeBrowserTabIdByWorktree: state.activeBrowserTabIdByWorktree,
      activeTabTypeByWorktree: state.activeTabTypeByWorktree,
      browserTabsByWorktree: state.browserTabsByWorktree,
      setActiveFile: state.setActiveFile,
      setTabColor: state.setTabColor,
      setTabCustomTitle: state.setTabCustomTitle
    }))
  )
  const activation = useTerminalActivationActions({ ...state, activeWorktreeId: titlebarWorktree })
  const noop = () => {}
  const controller: TerminalTitlebarController = {
    activeBrowserTabId: state.activeBrowserTabIdByWorktree[titlebarWorktree] ?? null,
    activeFileId: null,
    activeTabId: null,
    activeTabType: state.activeTabTypeByWorktree[titlebarWorktree] ?? 'browser',
    effectiveActiveLayout: undefined,
    expandedPaneByTabId: {},
    ...activation,
    handleCloseAllFiles: noop,
    handleCloseBrowserTab: noop,
    handleCloseFile: noop,
    handleCloseOthers: noop,
    handleCloseTab: noop,
    handleCloseTabsToLeft: noop,
    handleCloseTabsToRight: noop,
    handleDuplicateBrowserTab: async () => {},
    handleNewBrowserTab: noop,
    handleNewFile: async () => {},
    handleNewSimulatorTab: noop,
    handleNewTab: noop,
    handleOpenEntry: async () => {},
    makePreviewFilePermanent: noop,
    mobileEmulatorEnabled: false,
    pinFile: noop,
    renderedActiveWorktreeId: titlebarWorktree,
    setActiveFile: state.setActiveFile,
    setActiveTab: state.setActiveTab,
    setActiveTabType: state.setActiveTabType,
    setTabColor: state.setTabColor,
    setTabCustomTitle: state.setTabCustomTitle,
    tabBarOrder: [],
    titlebarTabsTarget: visible ? portal : null,
    worktreeBrowserTabs: state.browserTabsByWorktree[titlebarWorktree] ?? [],
    worktreeClientHostedBrowserRows: [],
    worktreeFiles: []
  }
  return <TerminalTitlebarTabs controller={controller} />
}
export function pairedTitlebarAcknowledgment() {
  return {
    worktree: titlebarWorktree,
    publicationEpoch: 'titlebar-epoch',
    snapshotVersion: 1,
    activeTabId: 'host-tab',
    activeTabType: 'browser',
    tabs: [{ id: 'host-tab', type: 'browser', isActive: true }]
  }
}
