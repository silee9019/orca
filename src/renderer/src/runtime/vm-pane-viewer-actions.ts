import { requestVmPaneAction } from './vm-pane-request'
import { requireHostViewer, waitForView } from './voice-viewer-target'
import type { VoiceViewerResult } from '../../../shared/voice-viewer'
export async function applyVmPaneViewerAction(
  operation: 'vm-copy-prompt' | 'vm-catalog-refresh',
  expiresAt: number
): Promise<Omit<VoiceViewerResult, 'viewerId'>> {
  const viewer = requireHostViewer()
  if (viewer.settings?.experimentalEphemeralVms !== true) {
    throw new Error('vm_feature_disabled')
  }
  if (viewer.activeModal !== 'none') {
    throw new Error('viewer_modal_busy')
  }
  viewer.openSettingsTarget({ pane: 'experimental', repoId: null, sectionId: 'ephemeral-vms' })
  viewer.openSettingsPage()
  if (
    !(await waitForView(
      () => document.querySelector('[data-settings-section="ephemeral-vms"]') !== null,
      expiresAt
    ))
  ) {
    throw new Error('vm_pane_unavailable')
  }
  const succeeded = await requestVmPaneAction(operation === 'vm-copy-prompt' ? 'copy' : 'refresh')
  requireHostViewer()
  const selector =
    operation === 'vm-copy-prompt'
      ? '[data-vm-prompt-copied="true"]'
      : '[data-vm-catalog-loading="false"]'
  return {
    viewer: 'host',
    persisted: false,
    applied:
      succeeded && (await waitForView(() => document.querySelector(selector) !== null, expiresAt))
  }
}
