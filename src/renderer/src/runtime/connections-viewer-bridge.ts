import { applyStatusBarConnectionsViewerRequest } from './status-bar-connections-viewer-controller'
import { applySshCredentialViewerRequest } from './ssh-credential-viewer'
import { applyPairingInputViewerRequest } from './pairing-input-viewer'
import { applyMobileNavigationViewerRequest } from './mobile-navigation-viewer'
import { applyRuntimeServerViewerRequest } from './runtime-server-viewer'
import { applyRuntimeLinkViewerRequest } from './runtime-link-viewer'
import { applyLocalNetworkTestViewerRequest } from './local-network-test-viewer'
import { applyNetworkProxyViewerRequest } from './network-proxy-viewer'
import { applyEmulatorSettingsViewerRequest } from './emulator-settings-viewer'
import { EmulatorSettingsViewerParams } from '../../../shared/emulator-settings-viewer'
import { applyMobileDriverViewerRequest } from './mobile-driver-viewer'
import { applySshPortsViewerRequest } from './ssh-ports-viewer'
import { applySkillsSharedViewerRequest } from './skills-shared-viewer'
import { applySshConfirmationViewerRequest } from './ssh-confirmation-viewer-controller'
import { applyPairingSetupConnectionsViewerRequest } from './pairing-setup-connections-viewer-controller'
import { applyMobileSettingsConnectionsViewerRequest } from './mobile-settings-connections-viewer-controller'
import { applyAddressConnectionsViewerRequest } from './address-connections-viewer-controller'
import { applyEmulatorConnectionsViewerRequest } from './emulator-connections-viewer-controller'
import { applySshConnectionsViewerRequest } from './ssh-connections-viewer-controller'
import { applyMobileConnectionsViewerRequest } from './mobile-connections-viewer-controller'
import type { ConnectionsViewerApi } from '../../../preload/api/connections-viewer-api'
import { applyRuntimeConnectionsViewerRequest } from './runtime-connections-viewer-controller'
export function attachConnectionsViewerBridge(api: ConnectionsViewerApi): () => void {
  let active = true
  let queue = Promise.resolve()
  const unsubscribe = api.onRequest((request) => {
    queue = queue.then(async () => {
      if (!active) {
        return
      }
      try {
        const result = await (request.command.operation.startsWith('status-bar.')
          ? applyStatusBarConnectionsViewerRequest(request)
          : request.command.operation === 'skills.shared-open'
            ? applySkillsSharedViewerRequest(request)
            : request.command.operation.startsWith('ssh-credential.')
              ? applySshCredentialViewerRequest(request)
              : request.command.operation.startsWith('pairing-input.')
                ? applyPairingInputViewerRequest(request)
                : request.command.operation.startsWith('mobile-navigation.')
                  ? await applyMobileNavigationViewerRequest(request)
                  : request.command.operation.startsWith('runtime-server.')
                    ? await applyRuntimeServerViewerRequest(request)
                    : request.command.operation.startsWith('runtime-link.')
                      ? applyRuntimeLinkViewerRequest(request)
                      : request.command.operation.startsWith('local-network-test.')
                        ? applyLocalNetworkTestViewerRequest(request)
                        : request.command.operation.startsWith('network-proxy.')
                          ? applyNetworkProxyViewerRequest(request)
                          : EmulatorSettingsViewerParams.safeParse(request.command).success
                            ? applyEmulatorSettingsViewerRequest(request)
                            : request.command.operation.startsWith('mobile-driver.')
                              ? applyMobileDriverViewerRequest(request)
                              : request.command.operation.startsWith('ssh-ports.')
                                ? applySshPortsViewerRequest(request)
                                : request.command.operation.startsWith('ssh-confirmation.') ||
                                    request.command.operation.startsWith('ssh-workspace.')
                                  ? applySshConfirmationViewerRequest(request)
                                  : request.command.operation.startsWith('pairing-setup.')
                                    ? applyPairingSetupConnectionsViewerRequest(request)
                                    : request.command.operation.startsWith('mobile-settings.')
                                      ? applyMobileSettingsConnectionsViewerRequest(request)
                                      : request.command.operation.startsWith('address.')
                                        ? applyAddressConnectionsViewerRequest(request)
                                        : request.command.operation.startsWith('emulator.')
                                          ? applyEmulatorConnectionsViewerRequest(request)
                                          : request.command.operation.startsWith('ssh.')
                                            ? applySshConnectionsViewerRequest(request)
                                            : request.command.operation.startsWith('mobile.')
                                              ? applyMobileConnectionsViewerRequest(request)
                                              : applyRuntimeConnectionsViewerRequest(request))
        if (active) {
          api.respond({ id: request.id, ok: true, result })
        }
      } catch {
        if (active) {
          api.respond({ id: request.id, ok: false, error: 'connections_viewer_request_failed' })
        }
      }
    })
  })
  return () => {
    active = false
    unsubscribe()
  }
}
