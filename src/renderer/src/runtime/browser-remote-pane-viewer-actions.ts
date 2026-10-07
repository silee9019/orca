import type { BrowserViewerCommand } from '../../../shared/rpc-contract/browser-viewer-params'
import type { BrowserRemotePaneState } from '../../../shared/rpc-contract/browser-remote-pane-params'
import { useAppStore } from '@/store'
import { findPage } from '@/store/slices/browser-page-records'
import { applyRemoteBrowserPaneCommand } from './browser-remote-pane-bridge'

export async function applyRemoteBrowserPaneViewerAction(
  command: Extract<BrowserViewerCommand, { operation: 'remote-pane' }>,
  expiresAt: number
): Promise<BrowserRemotePaneState> {
  const state = useAppStore.getState()
  if (!state.settings) {
    throw new Error('viewer_not_ready')
  }
  const page = findPage(state.browserPagesByWorkspace, command.page)
  if (!page) {
    throw new Error('browser_page_not_found')
  }
  const environmentId = command.command.environmentId
  const handle = state.remoteBrowserPageHandlesByPageId[page.id]
  if (
    (state.settings.activeRuntimeEnvironmentId &&
      state.settings.activeRuntimeEnvironmentId !== environmentId) ||
    (handle
      ? handle.environmentId !== environmentId ||
        handle.remotePageId !== command.command.expectedRemotePageId
      : page.browserRuntimeEnvironmentId !== environmentId ||
        command.command.expectedRemotePageId !== null)
  ) {
    throw new Error('remote_browser_pane_target_mismatch')
  }
  return applyRemoteBrowserPaneCommand(page.id, command.command, expiresAt)
}
