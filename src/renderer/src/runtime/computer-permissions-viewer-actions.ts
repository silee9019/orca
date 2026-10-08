import type {
  ComputerPermissionsViewerCommand,
  ComputerPermissionsViewerState
} from '../../../shared/rpc-contract/computer-permissions-viewer-params'
import { useAppStore } from '@/store'
import { requestComputerPermissionsViewer } from './computer-permissions-viewer-request'
export function requireComputerPermissionsViewer(): void {
  const state = useAppStore.getState()
  if (!state.persistedUIReady || !state.settings) {
    throw new Error('viewer_not_ready')
  }
  if (state.activeModal !== 'none') {
    throw new Error('viewer_modal_busy')
  }
  if (state.activeView !== 'settings') {
    throw new Error('computer_permissions_settings_inactive')
  }
  const owners = document.querySelectorAll('[data-computer-permission-settings-pane]')
  if (owners.length !== 1) {
    throw new Error(
      owners.length === 0
        ? 'computer_permissions_owner_unavailable'
        : 'computer_permissions_owner_ambiguous'
    )
  }
}
export async function applyComputerPermissionsViewerAction(
  command: ComputerPermissionsViewerCommand,
  expiresAt: number
): Promise<ComputerPermissionsViewerState> {
  requireComputerPermissionsViewer()
  return requestComputerPermissionsViewer(command, expiresAt)
}
