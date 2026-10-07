import type {
  BrowserSettingsCommand,
  BrowserSettingsState
} from '../../../shared/rpc-contract/browser-settings-params'
import { requireHostViewer, waitForView } from './voice-viewer-target'
import { requestBrowserSettings } from './browser-settings-request'
export async function applyBrowserSettingsViewerAction(
  command: BrowserSettingsCommand,
  expiresAt: number,
  hostId: string
): Promise<BrowserSettingsState> {
  const initial = requireHostViewer()
  if (initial.activeModal !== 'none') {
    throw new Error('viewer_modal_busy')
  }
  if (!document.querySelector('[data-browser-settings-pane]')) {
    if (
      ['profile-name', 'profile-create', 'profile-dialog-close', 'profile-dialog-status'].includes(
        command.action
      )
    ) {
      throw new Error('browser_settings_owner_unavailable')
    }
    initial.openSettingsTarget({ pane: 'browser', repoId: null })
    initial.openSettingsPage()
    if (
      !(await waitForView(
        () => document.querySelector('[data-browser-settings-pane]') !== null,
        expiresAt
      ))
    ) {
      throw new Error('browser_settings_pane_not_rendered')
    }
  }
  return requestBrowserSettings(command, expiresAt, hostId)
}
