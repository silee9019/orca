import type {
  PluginMarketplaceViewerCommand,
  PluginMarketplaceViewerState
} from '../../../shared/rpc-contract/plugin-marketplace-viewer-params'
import { requireHostViewer } from './voice-viewer-target'
import { requestPluginMarketplace } from './plugin-marketplace-request'

export function requirePluginMarketplaceViewer(): void {
  const state = requireHostViewer()
  if (state.activeModal !== 'none') {
    throw new Error('viewer_modal_busy')
  }
  if (state.activeView !== 'settings') {
    throw new Error('plugin_marketplace_settings_inactive')
  }
}
export async function applyPluginMarketplaceViewerAction(
  command: PluginMarketplaceViewerCommand,
  expiresAt: number
): Promise<PluginMarketplaceViewerState> {
  requirePluginMarketplaceViewer()
  return requestPluginMarketplace(command, expiresAt)
}
