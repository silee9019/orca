import type {
  BrowserRemotePaneCommand,
  BrowserRemotePaneState
} from '../../../shared/rpc-contract/browser-remote-pane-params'
import { requestRemoteBrowserPane } from './browser-remote-pane-request'
import { requestBrowserAddress } from './browser-address-request'
import { requestRemoteBrowserFailure } from './browser-remote-failure-request'
export async function applyRemoteBrowserPaneCommand(
  page: string,
  command: BrowserRemotePaneCommand,
  expiresAt: number
): Promise<BrowserRemotePaneState> {
  if (command.action !== 'address' && command.action !== 'failure') {
    return requestRemoteBrowserPane(page, command, expiresAt)
  }
  const fence = {
    environmentId: command.environmentId,
    expectedRemotePageId: command.expectedRemotePageId,
    action: 'status' as const
  }
  await requestRemoteBrowserPane(page, fence, expiresAt)
  const result =
    command.action === 'address'
      ? { address: await requestBrowserAddress(page, command.address, expiresAt) }
      : { failure: await requestRemoteBrowserFailure(page, command, expiresAt) }
  let remotePane
  try {
    remotePane = await requestRemoteBrowserPane(page, fence, expiresAt)
  } catch {
    throw new Error('remote_browser_pane_owner_changed_effect_unknown')
  }
  return { ...remotePane, ...result }
}
