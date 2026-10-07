import { applyBrowserPlacementViewerAction } from './browser-placement-viewer-actions'
import { requestBrowserGrabAction } from './browser-grab-action-request'
import { applyPluginMarketplaceViewerAction } from './plugin-marketplace-viewer-actions'
import { requestBrowserDocument } from './browser-document-request'
import { applyRemoteBrowserPaneViewerAction } from './browser-remote-pane-viewer-actions'
import { applyBrowserSettingsViewerAction } from './browser-settings-viewer-actions'
import { applyBrowserGrabRequest } from './browser-viewer-grab-request'
import { requestBrowserDownload } from './browser-download-request'
import { requestBrowserNewTab } from './browser-new-tab-request'
import { requestBrowserReloadMenu } from './browser-reload-menu-request'
import { requestBrowserAnnotationRow } from './browser-annotation-row-request'
import { requestBrowserContextMenu } from './browser-context-menu-request'
import { requestBrowserTabUi } from './browser-tab-ui-request'
import { requestBrowserGroupUi } from './browser-group-ui-request'
import { requestBrowserProfileUi } from './browser-profile-ui-request'
import { requestBrowserAnnotationTray } from './browser-annotation-tray-request'
import { requestBrowserAddress } from './browser-address-request'
import {
  browserViewportPresetToOverride,
  getBrowserViewportPreset
} from '../../../shared/browser-viewport-presets'
import { requestBrowserMarkupEditor } from './browser-markup-editor-request'
import { requestBrowserMarkup } from './browser-markup-request'
import { requestBrowserAnnotationDraft } from './browser-annotation-draft-request'
import { requestBrowserToolbar } from './browser-toolbar-request'
import { requestBrowserFind } from './browser-find-request'
import { webviewRegistry } from '@/components/browser-pane/host-guest/webview-registry'
import {
  ORCA_BROWSER_PAGE_ZOOM_EVENT,
  nextBrowserPageZoomLevel
} from '@/components/browser-pane/host-guest/browser-page-zoom'
import { useAppStore } from '@/store'
import { findPage } from '@/store/slices/browser-page-records'
import { BrowserViewerCommand } from '../../../shared/rpc-contract/browser-viewer-params'
import type {
  BrowserViewerRequest,
  BrowserViewerResult
} from '../../../shared/browser-viewer-command'

export async function applyBrowserViewerRequest(
  request: BrowserViewerRequest
): Promise<BrowserViewerResult> {
  const command = BrowserViewerCommand.parse(request.command)
  if (Date.now() >= request.expiresAt) {
    throw new Error('request_expired')
  }
  const state = useAppStore.getState()
  if (!state.settings || !state.persistedUIReady) {
    throw new Error('viewer_not_ready')
  }
  if (command.operation === 'new-tab') {
    const newTab = await requestBrowserNewTab(command.target, request.expiresAt)
    return { viewer: 'host', viewerId: 0, persisted: false, rendered: false, newTab, applied: true }
  }
  const base = { viewer: 'host', viewerId: 0, persisted: false, rendered: false } as const
  if (
    command.operation === 'webauthn-dialog' ||
    command.operation === 'load-failure' ||
    command.operation === 'workspace-file-open' ||
    command.operation === 'workspace-port-open' ||
    command.operation === 'palette-select' ||
    command.operation === 'floating-browser' ||
    command.operation === 'remote-picker' ||
    command.operation === 'linked-browser'
  ) {
    return await applyBrowserPlacementViewerAction(command, request.expiresAt)
  }
  if (command.operation === 'remote-pane') {
    const remotePane = await applyRemoteBrowserPaneViewerAction(command, request.expiresAt)
    return { ...base, page: command.page, applied: true, remotePane }
  }
  if (state.settings.activeRuntimeEnvironmentId) {
    throw new Error('viewer_runtime_mismatch')
  }
  if (command.operation === 'plugin-marketplace') {
    const marketplace = await applyPluginMarketplaceViewerAction(command.command, request.expiresAt)
    return { ...base, applied: true, marketplace }
  }
  if (command.operation === 'group-ui') {
    const groupUi = await requestBrowserGroupUi(command.target, command.action, request.expiresAt)
    return { ...base, applied: true, groupUi }
  }
  if (command.operation === 'tab-ui') {
    const tabUi = await requestBrowserTabUi(
      command.target,
      command.action,
      request.expiresAt,
      command.point
    )
    return { ...base, applied: true, tabUi }
  }
  if (command.operation === 'browser-settings') {
    const settings = await applyBrowserSettingsViewerAction(
      command.command,
      request.expiresAt,
      command.hostId
    )
    return { ...base, settings, applied: true }
  }
  if (command.operation === 'document') {
    const document = await requestBrowserDocument(command.page, command.command, request.expiresAt)
    return { ...base, page: command.page, applied: true, document }
  }
  if (command.operation === 'download-cancel') {
    const applied = await window.api.browser.cancelDownload({ downloadId: command.downloadId })
    return { ...base, applied }
  }
  if (command.operation === 'webauthn-respond') {
    const applied = await window.api.browser.respondWebAuthnAccount({
      requestId: command.requestId,
      credentialId: command.credentialId
    })
    return { ...base, applied }
  }
  if (command.operation === 'history-list' || command.operation === 'history-clear') {
    if (command.operation === 'history-clear') {
      state.clearBrowserHistory()
    }
    return {
      ...base,
      applied:
        command.operation === 'history-list' ||
        useAppStore.getState().browserUrlHistory.length === 0,
      history: useAppStore.getState().browserUrlHistory
    }
  }
  const page = findPage(state.browserPagesByWorkspace, command.page)
  if (!page) {
    throw new Error('browser_page_not_found')
  }
  if (page.browserRuntimeEnvironmentId || state.remoteBrowserPageHandlesByPageId[page.id]) {
    throw new Error('browser_page_host_mismatch')
  }
  if (command.operation === 'annotation-draft' || command.operation === 'annotation-add') {
    const draft = requestBrowserAnnotationDraft(
      page.id,
      command.operation === 'annotation-add'
        ? { action: 'add', comment: command.comment, intent: command.intent }
        : { action: command.action },
      request.expiresAt
    )
    return { ...base, page: page.id, draft, applied: true }
  }
  if (command.operation === 'grab-action') {
    const grabAction = await requestBrowserGrabAction(page.id, command.key, request.expiresAt)
    return { ...base, page: page.id, grabAction, applied: true }
  }
  if (command.operation === 'download-ui') {
    const download = await requestBrowserDownload(
      page.id,
      command.downloadId,
      command.action,
      request.expiresAt
    )
    return { ...base, page: page.id, download, applied: true }
  }
  if (command.operation === 'reload-menu') {
    const reloadMenu = await requestBrowserReloadMenu(page.id, command.action, request.expiresAt)
    return { ...base, page: page.id, reloadMenu, applied: true }
  }
  if (command.operation === 'context-menu') {
    const contextMenu = await requestBrowserContextMenu(page.id, command.action, request.expiresAt)
    return { ...base, page: page.id, contextMenu, applied: true }
  }
  if (command.operation === 'grab') {
    const grab = await applyBrowserGrabRequest(command, request.expiresAt)
    return { ...base, page: page.id, grab, applied: true }
  }
  if (command.operation === 'toolbar-navigation') {
    const toolbar = requestBrowserToolbar(page.id, command.action, request.expiresAt)
    return { ...base, page: page.id, toolbar, applied: true }
  }
  if (command.operation === 'find' || command.operation === 'find-query') {
    const find = await requestBrowserFind(
      page.id,
      command.operation === 'find-query' ? 'query' : command.action,
      request.expiresAt,
      command.operation === 'find-query' ? command.query : undefined
    )
    return { ...base, page: page.id, find, applied: true }
  }
  if (command.operation === 'zoom') {
    const webview = webviewRegistry.get(page.id)
    if (!webview) {
      throw new Error('browser_guest_unavailable')
    }
    const expected = nextBrowserPageZoomLevel(webview.getZoomLevel(), command.direction)
    window.dispatchEvent(
      new CustomEvent(ORCA_BROWSER_PAGE_ZOOM_EVENT, {
        detail: { browserPageId: page.id, direction: command.direction }
      })
    )
    const zoomLevel = webview.getZoomLevel()
    return { ...base, page: page.id, zoomLevel, applied: zoomLevel === expected }
  }
  if (command.operation === 'devtools-open') {
    const applied = await window.api.browser.openDevTools({ browserPageId: page.id })
    return { ...base, page: page.id, applied }
  }
  if (command.operation === 'viewport-preset') {
    const preset = getBrowserViewportPreset(command.preset)
    const accepted = await window.api.browser.setViewportOverride({
      browserPageId: page.id,
      override: preset ? browserViewportPresetToOverride(preset) : null
    })
    if (accepted) {
      state.setBrowserPageViewportPreset(page.id, command.preset)
    }
    const current = findPage(useAppStore.getState().browserPagesByWorkspace, page.id)
    return {
      ...base,
      page: page.id,
      preset: current?.viewportPresetId ?? null,
      applied: accepted && current !== null && current?.viewportPresetId === command.preset
    }
  }
  if (command.operation === 'annotation-row') {
    const row = await requestBrowserAnnotationRow(page.id, command.command, request.expiresAt)
    return { ...base, page: page.id, applied: true, annotationRow: row }
  }
  if (command.operation === 'annotation-tray') {
    const tray = await requestBrowserAnnotationTray(page.id, command.action, request.expiresAt)
    return { ...base, page: page.id, applied: true, annotationTray: tray }
  }
  if (command.operation === 'profile-ui') {
    const profileUi = await requestBrowserProfileUi(page.id, command.command, request.expiresAt)
    return { ...base, page: page.id, applied: true, profileUi }
  }
  if (command.operation === 'address') {
    const address = await requestBrowserAddress(page.id, command.command, request.expiresAt)
    return { ...base, page: page.id, applied: true, address }
  }
  if (command.operation === 'markup-editor') {
    const editor = await requestBrowserMarkupEditor(page.id, command.command, request.expiresAt)
    return { ...base, page: page.id, applied: true, markupEditor: editor }
  }
  if (command.operation === 'markup') {
    const markup = await requestBrowserMarkup(page.id, command.action, request.expiresAt)
    return { ...base, page: page.id, applied: true, markup }
  }
  const before = state.browserAnnotationsByPageId[page.id] ?? []
  if (command.operation === 'annotation-update' || command.operation === 'annotation-delete') {
    if (!before.some((note) => note.id === command.annotationId)) {
      throw new Error('browser_annotation_not_found')
    }
    if (command.operation === 'annotation-update') {
      state.updateBrowserPageAnnotation(page.id, command.annotationId, {
        comment: command.comment,
        intent: command.intent
      })
    } else {
      state.deleteBrowserPageAnnotation(page.id, command.annotationId)
    }
  } else if (command.operation === 'annotation-clear') {
    state.clearBrowserPageAnnotations(page.id)
  }
  const notes = useAppStore.getState().browserAnnotationsByPageId[page.id] ?? []
  const applied =
    command.operation === 'annotation-list' ||
    (command.operation === 'annotation-clear'
      ? notes.length === 0
      : command.operation === 'annotation-delete'
        ? !notes.some((note) => note.id === command.annotationId)
        : notes.some(
            (note) =>
              note.id === command.annotationId &&
              note.comment === command.comment &&
              note.intent === command.intent
          ))
  return {
    ...base,
    page: page.id,
    applied,
    annotations: notes.map(({ id, comment, intent, priority, createdAt }) => ({
      id,
      comment,
      intent,
      priority,
      createdAt
    }))
  }
}
