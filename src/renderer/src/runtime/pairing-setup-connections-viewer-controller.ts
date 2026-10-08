import type {
  ConnectionsViewerRequest,
  PairingSetupConnectionsViewerResult,
  PairingSetupConnectionsViewerState
} from '../../../shared/connections-viewer'
import { PairingSetupConnectionsViewerParams } from '../../../shared/rpc-contract/pairing-setup-viewer-params'
export type PairingSetupConnectionsViewerController = {
  read: () => PairingSetupConnectionsViewerState
  setOpen: (open: boolean) => void
}
const mounted = new Set<PairingSetupConnectionsViewerController>()
export function mountPairingSetupConnectionsViewerController(
  controller: PairingSetupConnectionsViewerController
): () => void {
  mounted.add(controller)
  return () => {
    mounted.delete(controller)
  }
}
export async function applyPairingSetupConnectionsViewerRequest(
  request: ConnectionsViewerRequest
): Promise<PairingSetupConnectionsViewerResult> {
  const command = PairingSetupConnectionsViewerParams.parse(request.command)
  if (mounted.size > 1) {
    throw new Error('connections_viewer_ambiguous')
  }
  const controller = mounted.values().next().value
  if (!controller) {
    throw new Error('connections_surface_unavailable')
  }
  if (Date.now() >= request.expiresAt) {
    throw new Error('request_expired')
  }
  if (command.operation === 'pairing-setup.disclosure') {
    const initial = controller.read()
    if (!command.open && (initial.pinned || !initial.usingRelay)) {
      throw new Error('address_disclosure_required')
    }
    controller.setOpen(command.open)
    while (
      mounted.size === 1 &&
      mounted.has(controller) &&
      Date.now() < request.expiresAt &&
      controller.read().open !== command.open
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }
  if (!mounted.has(controller) || mounted.size !== 1 || Date.now() >= request.expiresAt) {
    throw new Error('request_expired')
  }
  const state = controller.read()
  return {
    viewerId: command.viewerId,
    state,
    applied: command.operation === 'pairing-setup.get' || state.open === command.open,
    persisted: null
  }
}
