import { useAppStore } from '@/store'
import { getDefaultSettings } from '../../../../../shared/constants'
import { makeFolderWorkspace } from '@/store/slices/worktrees-slice-test-fixtures'
import { installClientHostedPaneApi } from '../client-hosted-browser-pane-test-rig'
export function seedBrowserOverlayFocusOwner() {
  installClientHostedPaneApi()
  useAppStore.setState({
    settings: getDefaultSettings('/fixture'),
    persistedUIReady: true,
    activeWorktreeId: 'folder:fixture',
    activeWorkspaceExecutionHostId: 'local',
    folderWorkspaces: [makeFolderWorkspace({ id: 'fixture', executionHostId: 'local' })]
  })
  useAppStore.getState().createBrowserTab('folder:fixture', 'about:blank', {
    browserPageId: 'page',
    browserRuntimeEnvironmentId: null
  })
  const state = useAppStore.getState()
  const workspace = state.browserTabsByWorktree['folder:fixture']?.find(
    (tab) => tab.activePageId === 'page'
  )
  const group = state.groupsByWorktree['folder:fixture']?.find((entry) => entry.activeTabId)
  if (!workspace || !group) {
    throw new Error('missing fixture owner')
  }
  return {
    worktreeId: 'folder:fixture',
    workspaceId: workspace.id,
    groupId: group.id,
    executionHostId: 'local' as const
  }
}
