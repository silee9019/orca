import type { BrowserViewerCommand } from '../../../shared/rpc-contract/browser-viewer-params'
import type { BrowserRemotePaneState } from '../../../shared/rpc-contract/browser-remote-pane-params'
import { useAppStore } from '@/store'
import { findPage } from '@/store/slices/browser-page-records'
import { requestRemoteBrowserPane } from './browser-remote-pane-request'
import { requestBrowserAddress } from './browser-address-request'

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
  if (command.command.action === 'address') {
    const fence = {
      environmentId,
      expectedRemotePageId: command.command.expectedRemotePageId,
      action: 'status' as const
    }
    await requestRemoteBrowserPane(page.id, fence, expiresAt)
    const address = await requestBrowserAddress(page.id, command.command.address, expiresAt)
    let remotePane
    try {
      remotePane = await requestRemoteBrowserPane(page.id, fence, expiresAt)
    } catch {
      throw new Error('remote_browser_address_owner_changed_effect_unknown')
    }
    return { ...remotePane, address }
  }
  const remotePane = await requestRemoteBrowserPane(page.id, command.command, expiresAt)
  return remotePane
}
