import { StatusBarConnectionsViewerResult } from '../../shared/status-bar-connections-viewer'
import { SshCredentialViewerResultSchema } from '../../shared/ssh-credential-viewer'
import { PairingInputViewerResultSchema } from '../../shared/pairing-input-viewer'
import { MobileNavigationViewerResultSchema } from '../../shared/mobile-navigation-viewer'
import { RuntimeServerViewerResultSchema } from '../../shared/runtime-server-viewer'
import { RuntimeLinkViewerResultSchema } from '../../shared/runtime-link-viewer'
import { LocalNetworkTestViewerResultSchema } from '../../shared/local-network-test-viewer'
import { NetworkProxyViewerResultSchema } from '../../shared/network-proxy-viewer'
import {
  EmulatorSettingsViewerParams,
  EmulatorSettingsViewerResultSchema
} from '../../shared/emulator-settings-viewer'
import { MobileDriverViewerResultSchema } from '../../shared/mobile-driver-viewer'
import { SshPortsViewerResultSchema } from '../../shared/ssh-ports-viewer'
import { SkillsSharedViewerResultSchema } from '../../shared/skills-shared-viewer'
import {
  SshConfirmationViewerResultSchema,
  SshWorkspaceRemovalViewerResultSchema
} from '../../shared/ssh-confirmation-viewer'
import { randomUUID } from 'node:crypto'
import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import {
  PairingSetupConnectionsViewerResultSchema,
  MobileSettingsConnectionsViewerResultSchema,
  AddressConnectionsViewerResultSchema,
  EmulatorConnectionsViewerResultSchema,
  RuntimeConnectionsViewerResultSchema,
  MobileConnectionsViewerResultSchema,
  SshConnectionsViewerResultSchema,
  type ConnectionsViewerResponse,
  type ConnectionsViewerResult
} from '../../shared/connections-viewer'
import type { ConnectionsViewerCommand } from '../../shared/rpc-contract/connections-viewer-params'

export function requestConnectionsViewerFromRenderer(
  window: BrowserWindow,
  command: ConnectionsViewerCommand
): Promise<ConnectionsViewerResult> {
  if (window.isDestroyed() || window.webContents.isDestroyed()) {
    return Promise.reject(new Error('renderer_unavailable'))
  }
  if (command.viewerId !== window.id) {
    return Promise.reject(new Error('viewer_target_mismatch'))
  }
  const contents = window.webContents
  const id = randomUUID()
  return new Promise((resolve, reject) => {
    let settled = false
    const unavailable = (): void => finish(new Error('renderer_unavailable'))
    const finish = (error?: Error, result?: ConnectionsViewerResult): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      ipcMain.removeListener('ui:connectionsViewerResponse', response)
      window.removeListener('closed', unavailable)
      contents.removeListener('destroyed', unavailable)
      contents.removeListener('render-process-gone', unavailable)
      contents.removeListener('did-start-loading', unavailable)
      if (error) {
        reject(error)
      } else if (result) {
        resolve({ ...result, viewerId: window.id })
      }
    }
    const response = (event: Electron.IpcMainEvent, value: ConnectionsViewerResponse): void => {
      if (event.sender !== contents || value?.id !== id) {
        return
      }
      if (value.ok !== true) {
        finish(new Error('connections_viewer_request_failed'))
        return
      }
      const schema = command.operation.startsWith('status-bar.')
        ? StatusBarConnectionsViewerResult
        : command.operation === 'skills.shared-open'
          ? SkillsSharedViewerResultSchema
          : command.operation.startsWith('ssh-credential.')
            ? SshCredentialViewerResultSchema
            : command.operation.startsWith('pairing-input.')
              ? PairingInputViewerResultSchema
              : command.operation.startsWith('mobile-navigation.')
                ? MobileNavigationViewerResultSchema
                : command.operation.startsWith('runtime-server.')
                  ? RuntimeServerViewerResultSchema
                  : command.operation.startsWith('runtime-link.')
                    ? RuntimeLinkViewerResultSchema
                    : command.operation.startsWith('local-network-test.')
                      ? LocalNetworkTestViewerResultSchema
                      : command.operation.startsWith('network-proxy.')
                        ? NetworkProxyViewerResultSchema
                        : EmulatorSettingsViewerParams.safeParse(command).success
                          ? EmulatorSettingsViewerResultSchema
                          : command.operation.startsWith('mobile-driver.')
                            ? MobileDriverViewerResultSchema
                            : command.operation.startsWith('ssh-ports.')
                              ? SshPortsViewerResultSchema
                              : command.operation.startsWith('ssh-workspace.')
                                ? SshWorkspaceRemovalViewerResultSchema
                                : command.operation.startsWith('ssh-confirmation.')
                                  ? SshConfirmationViewerResultSchema
                                  : command.operation.startsWith('pairing-setup.')
                                    ? PairingSetupConnectionsViewerResultSchema
                                    : command.operation.startsWith('mobile-settings.')
                                      ? MobileSettingsConnectionsViewerResultSchema
                                      : command.operation.startsWith('address.')
                                        ? AddressConnectionsViewerResultSchema
                                        : command.operation.startsWith('emulator.')
                                          ? EmulatorConnectionsViewerResultSchema
                                          : command.operation.startsWith('mobile.')
                                            ? MobileConnectionsViewerResultSchema
                                            : command.operation.startsWith('ssh.')
                                              ? SshConnectionsViewerResultSchema
                                              : RuntimeConnectionsViewerResultSchema
      const parsed = schema.safeParse(value.result)
      if (!parsed.success) {
        finish(new Error('invalid_renderer_response'))
        return
      }
      if (parsed.data.viewerId !== window.id) {
        finish(new Error('renderer_viewer_mismatch'))
        return
      }
      finish(undefined, parsed.data)
    }
    const timer = setTimeout(
      () => finish(new Error('renderer_timeout_persistence_unknown')),
      10_000
    )
    ipcMain.on('ui:connectionsViewerResponse', response)
    window.once('closed', unavailable)
    contents.once('destroyed', unavailable)
    contents.once('render-process-gone', unavailable)
    contents.once('did-start-loading', unavailable)
    try {
      contents.send('ui:connectionsViewerRequest', { id, command, expiresAt: Date.now() + 9000 })
    } catch {
      unavailable()
    }
  })
}
