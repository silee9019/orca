import type {
  BrowserSetupGuideCommand,
  BrowserSetupGuideState
} from '../../../shared/rpc-contract/browser-setup-guide-params'
import { requireHostViewer } from './voice-viewer-target'
import { requestBrowserSetupGuide } from './browser-setup-guide-request'
export function requireBrowserSetupGuide(command: BrowserSetupGuideCommand): void {
  const state = requireHostViewer()
  if (
    command.surface === 'modal'
      ? state.activeModal !== 'setup-guide'
      : state.activeModal !== 'none' || state.activeView !== 'settings'
  ) {
    throw new Error('browser_setup_guide_surface_inactive')
  }
  if (state.activeWorktreeId !== command.workspaceId) {
    throw new Error('browser_setup_guide_workspace_mismatch')
  }
  const owners = document.querySelectorAll('[data-browser-setup-guide-action]')
  if (owners.length !== 1) {
    throw new Error(
      owners.length
        ? 'browser_setup_guide_owner_ambiguous'
        : 'browser_setup_guide_owner_unavailable'
    )
  }
}
export async function applyBrowserSetupGuideAction(
  command: BrowserSetupGuideCommand,
  expiresAt: number
): Promise<BrowserSetupGuideState> {
  requireBrowserSetupGuide(command)
  return requestBrowserSetupGuide(command, expiresAt)
}
