import { requestBrowserEgress } from './browser-egress-request'
import { requestBrowserViewportPan } from './browser-viewport-pan-request'
import { requestBrowserMarkupHint } from './browser-markup-hint-request'
import { requestBrowserMarkupEditor } from './browser-markup-editor-request'
import { requestBrowserMarkup } from './browser-markup-request'
import { applyBrowserImportHintAction } from './browser-import-hint-actions'
import { requestBrowserBanner } from './browser-banner-request'
import { requestBrowserOverlayFocus } from './browser-overlay-focus-request'
import { applyBrowserSetupGuideAction } from './browser-setup-guide-actions'
import { applyBrowserFeatureWallAction } from './browser-feature-wall-actions'
import { requestClientHostedBrowserRow } from './client-hosted-browser-row-request'
import { applyBrowserClientMarkupRequest } from './browser-client-markup-request'
import { requestBrowserTakeBack } from './browser-take-back-request'
import { requestBrowserObservation } from './browser-observation-request'
import { applyComputerPermissionsViewerAction } from './computer-permissions-viewer-actions'
import { requestBrowserWebAuthnDialog } from './browser-webauthn-dialog-request'
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
        | 'browser-import-hint'
        | 'egress'
        | 'banner'
        | 'viewport-pan'
        | 'markup-hint'
        | 'markup-editor'
        | 'markup'
        | 'overlay-focus'
        | 'browser-setup-guide'
        | 'browser-feature-wall'
        | 'client-hosted-row'
        | 'client-markup'
        | 'take-back'
        | 'observe-page'
        | 'computer-permissions'
        | 'load-failure'
        | 'webauthn-dialog'
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
  if (command.operation === 'browser-import-hint') {
    const browserImportHint = await applyBrowserImportHintAction(command.command, expiresAt)
    return { ...base, applied: true, browserImportHint }
  }
  if (command.operation === 'egress') {
    const egress = await requestBrowserEgress(command.command, expiresAt)
    return { ...base, applied: true, egress }
  }
  if (command.operation === 'banner') {
    return {
      ...base,
      applied: true,
      banner: await requestBrowserBanner(command.command, expiresAt)
    }
  }
  if (command.operation === 'viewport-pan') {
    const viewportPan = await requestBrowserViewportPan(command.page, command.delta, expiresAt)
    return { ...base, page: command.page, applied: true, viewportPan }
  }
  if (command.operation === 'markup-hint') {
    const markupHint = await requestBrowserMarkupHint(command.page, command.action, expiresAt)
    return { ...base, page: command.page, applied: true, markupHint }
  }
  if (command.operation === 'markup-editor') {
    const markupEditor = await requestBrowserMarkupEditor(command.page, command.command, expiresAt)
    return { ...base, page: command.page, applied: true, markupEditor }
  }
  if (command.operation === 'markup') {
    const markup = await requestBrowserMarkup(command.page, command.action, expiresAt)
    return { ...base, page: command.page, applied: true, markup }
  }
  if (command.operation === 'overlay-focus') {
    return {
      ...base,
      applied: true,
      overlayFocus: requestBrowserOverlayFocus(command.command, expiresAt)
    }
  }
  if (command.operation === 'browser-setup-guide') {
    const browserSetupGuide = await applyBrowserSetupGuideAction(command.command, expiresAt)
    return { ...base, applied: true, browserSetupGuide }
  }
  if (command.operation === 'browser-feature-wall') {
    const browserFeatureWall = await applyBrowserFeatureWallAction(command.command, expiresAt)
    return { ...base, applied: true, browserFeatureWall }
  }
  if (command.operation === 'client-hosted-row') {
    const clientHostedRow = await requestClientHostedBrowserRow(command.command, expiresAt)
    return { ...base, applied: true, page: command.command.page, clientHostedRow }
  }
  if (command.operation === 'client-markup') {
    return await applyBrowserClientMarkupRequest(command, expiresAt)
  }
  if (command.operation === 'take-back') {
    const takeBack = await requestBrowserTakeBack(command.command, expiresAt)
    return { ...base, applied: true, page: command.command.page, takeBack }
  }
  if (command.operation === 'observe-page') {
    const observation = await requestBrowserObservation(command.command, expiresAt)
    return { ...base, applied: true, page: command.command.page, observation }
  }
  if (command.operation === 'computer-permissions') {
    const computerPermissions = await applyComputerPermissionsViewerAction(
      command.command,
      expiresAt
    )
    return { ...base, applied: true, computerPermissions }
  }
  if (command.operation === 'webauthn-dialog') {
    const webAuthnDialog = await requestBrowserWebAuthnDialog(command.command, expiresAt)
    return { ...base, applied: true, page: command.command.page, webAuthnDialog }
  }
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
