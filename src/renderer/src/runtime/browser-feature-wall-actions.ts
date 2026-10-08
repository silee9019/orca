import type {
  BrowserFeatureWallCommand,
  BrowserFeatureWallState
} from '../../../shared/rpc-contract/browser-feature-wall-params'
import { requireHostViewer } from './voice-viewer-target'
import { requestBrowserFeatureWall } from './browser-feature-wall-request'
export function requireBrowserFeatureWall(command: BrowserFeatureWallCommand): void {
  const state = requireHostViewer()
  if (state.activeModal !== 'feature-wall') {
    throw new Error('browser_feature_wall_inactive')
  }
  if (state.activeWorktreeId !== command.workspaceId) {
    throw new Error('browser_feature_wall_workspace_mismatch')
  }
  const owners = document.querySelectorAll('[data-browser-feature-wall-setup]')
  if (owners.length !== 1) {
    throw new Error(
      owners.length
        ? 'browser_feature_wall_owner_ambiguous'
        : 'browser_feature_wall_owner_unavailable'
    )
  }
}
export async function applyBrowserFeatureWallAction(
  command: BrowserFeatureWallCommand,
  expiresAt: number
): Promise<BrowserFeatureWallState> {
  requireBrowserFeatureWall(command)
  return requestBrowserFeatureWall(command, expiresAt)
}
