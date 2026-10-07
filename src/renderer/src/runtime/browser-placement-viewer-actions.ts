import { requestWorkspaceFileOpen } from './workspace-file-open-request'
import { requestWorkspacePortOpen } from './workspace-port-open-request'
import { applyBrowserPaletteSelection } from './browser-palette-selection'
import { requestFloatingBrowser } from './floating-browser-request'
import { requestRemoteFilePicker } from './remote-file-picker-request'
import { requestLinkedBrowser } from './linked-browser-request'
import { requestBrowserFailure } from './browser-failure-request'
import type { BrowserViewerCommand } from '../../../shared/rpc-contract/browser-viewer-params'
import type { BrowserViewerResult } from '../../../shared/browser-viewer-command'

export async function applyBrowserPlacementViewerAction(
  command: Extract<
    BrowserViewerCommand,
    {
      operation:
        | 'load-failure'
        | 'workspace-file-open'
        | 'workspace-port-open'
        | 'palette-select'
        | 'floating-browser'
        | 'remote-picker'
        | 'linked-browser'
    }
  >,
  expiresAt: number
): Promise<BrowserViewerResult> {
  const base = { viewer: 'host', viewerId: 0, persisted: false, rendered: false } as const
  if (command.operation === 'load-failure') {
    const failureState = await requestBrowserFailure(command.page, command.command, expiresAt)
    return { ...base, page: command.page, applied: true, failureState }
  }
  if (command.operation === 'workspace-file-open') {
    const fileOpenState = requestWorkspaceFileOpen(command.command, expiresAt)
    return { ...base, applied: true, fileOpenState }
  }
  if (command.operation === 'workspace-port-open') {
    const portOpenState = await requestWorkspacePortOpen(command.command, expiresAt)
    return { ...base, applied: true, portOpenState }
  }
  if (command.operation === 'palette-select') {
    const paletteState = await applyBrowserPaletteSelection(command.selection, expiresAt)
    return { ...base, applied: true, paletteState }
  }
  if (command.operation === 'floating-browser') {
    const floatingBrowser = requestFloatingBrowser(command.command, expiresAt)
    return { ...base, applied: true, floatingBrowser }
  }
  if (command.operation === 'remote-picker') {
    const remotePicker = await requestRemoteFilePicker(command.command, expiresAt)
    return { ...base, applied: true, remotePicker }
  }
  const linkedBrowser = await requestLinkedBrowser(command.command, expiresAt)
  return { ...base, applied: true, linkedBrowser }
}
