import { BrowserOverlayFocusState } from './rpc-contract/browser-overlay-focus-params'
import { BrowserSetupGuideState } from './rpc-contract/browser-setup-guide-params'
import { ClientHostedBrowserRowState } from './rpc-contract/client-hosted-browser-row-params'
import { BrowserClientMarkupReceipt } from './rpc-contract/browser-client-markup-params'
import { BrowserFeatureWallState } from './rpc-contract/browser-feature-wall-params'
import { BrowserTakeBackState } from './rpc-contract/browser-take-back-params'
import { BrowserObservationState } from './rpc-contract/browser-observation-params'
import { ComputerPermissionsViewerState } from './rpc-contract/computer-permissions-viewer-params'
import { BrowserSshRouteReceipt } from './rpc-contract/browser-ssh-route-params'
import { BrowserWebAuthnDialogState } from './rpc-contract/browser-webauthn-dialog-params'
import { BrowserFailureState } from './rpc-contract/browser-failure-params'
import { BrowserGrabActionReceipt } from './rpc-contract/browser-grab-action-params'
import { WorkspaceFileOpenState } from './rpc-contract/workspace-file-open-params'
import { WorkspacePortOpenState } from './rpc-contract/workspace-port-open-params'
import { PluginMarketplaceViewerState } from './rpc-contract/plugin-marketplace-viewer-params'
import { BrowserPaletteState } from './rpc-contract/browser-palette-params'
import { RemoteFilePickerState } from './rpc-contract/remote-file-picker-params'
import { LinkedBrowserState } from './rpc-contract/linked-browser-params'
import { FloatingBrowserState } from './rpc-contract/floating-browser-params'
import { BrowserDownloadReceipt } from './rpc-contract/browser-download-params'
import { BrowserNewTabState } from './rpc-contract/browser-new-tab-params'
import { BrowserReloadMenuState } from './rpc-contract/browser-reload-menu-params'
import { BrowserAnnotationRowState } from './rpc-contract/browser-annotation-row-params'
import { BrowserContextMenuState } from './rpc-contract/browser-context-menu-params'
import { BrowserTabUiState } from './rpc-contract/browser-tab-ui-params'
import { BrowserGroupUiState } from './rpc-contract/browser-group-ui-params'
import { BrowserProfileUiState } from './rpc-contract/browser-profile-ui-params'
import { z } from 'zod'
import { BrowserDocumentState } from './rpc-contract/browser-document-params'
import { BrowserRemotePaneState } from './rpc-contract/browser-remote-pane-params'
import { BrowserSettingsState } from './rpc-contract/browser-settings-params'
import { BrowserAnnotationTrayState } from './rpc-contract/browser-annotation-tray-params'
import { BrowserAddressState } from './rpc-contract/browser-address-params'
import { BrowserMarkupEditorState } from './rpc-contract/browser-markup-editor-params'
import type { BrowserViewerCommand } from './rpc-contract/browser-viewer-params'
import { BrowserToolbarAction, BrowserViewerPreset } from './rpc-contract/browser-viewer-params'

export type BrowserViewerRequest = { id: string; expiresAt: number; command: BrowserViewerCommand }
// applied reports store read-back or service acceptance; rendering and durable saving need separate evidence.
export const BrowserViewerResultSchema = z.object({
  browserSetupGuide: BrowserSetupGuideState.optional(),
  clientHostedRow: ClientHostedBrowserRowState.optional(),
  clientMarkup: BrowserClientMarkupReceipt.optional(),
  browserFeatureWall: BrowserFeatureWallState.optional(),
  takeBack: BrowserTakeBackState.optional(),
  sshRoute: BrowserSshRouteReceipt.optional(),
  viewer: z.literal('host'),
  viewerId: z.number().int(),
  floatingBrowser: FloatingBrowserState.optional(),
  linkedBrowser: LinkedBrowserState.optional(),
  remotePicker: RemoteFilePickerState.optional(),
  applied: z.boolean(),
  overlayFocus: BrowserOverlayFocusState.optional(),
  persisted: z.literal(false),
  rendered: z.literal(false),
  fileOpenState: WorkspaceFileOpenState.optional(),
  portOpenState: WorkspacePortOpenState.optional(),
  computerPermissions: ComputerPermissionsViewerState.optional(),
  marketplace: PluginMarketplaceViewerState.optional(),
  paletteState: BrowserPaletteState.optional(),
  page: z.string().optional(),
  observation: BrowserObservationState.optional(),
  newTab: BrowserNewTabState.optional(),
  download: BrowserDownloadReceipt.optional(),
  grabAction: BrowserGrabActionReceipt.optional(),
  reloadMenu: BrowserReloadMenuState.optional(),
  contextMenu: BrowserContextMenuState.optional(),
  tabUi: BrowserTabUiState.optional(),
  groupUi: BrowserGroupUiState.optional(),
  profileUi: BrowserProfileUiState.optional(),
  annotationRow: BrowserAnnotationRowState.optional(),
  document: BrowserDocumentState.optional(),
  remotePane: BrowserRemotePaneState.optional(),
  failureState: BrowserFailureState.optional(),
  webAuthnDialog: BrowserWebAuthnDialogState.optional(),
  settings: BrowserSettingsState.optional(),
  annotationTray: BrowserAnnotationTrayState.optional(),
  address: BrowserAddressState.optional(),
  markupEditor: BrowserMarkupEditorState.optional(),
  markup: z
    .object({ state: z.enum(['idle', 'capturing', 'drawing', 'composing']), hasImage: z.boolean() })
    .optional(),
  grab: z
    .object({
      state: z.enum(['idle', 'armed', 'awaiting', 'confirming', 'error']),
      hasSelection: z.boolean(),
      hasScreenshot: z.boolean(),
      contextMenu: z.boolean(),
      intent: z.enum(['copy', 'annotate']).optional()
    })
    .optional(),
  toolbar: z
    .object({
      action: BrowserToolbarAction,
      intent: z
        .enum(['stop', 'retry-guest-recovery', 'retry-load', 'reload', 'hard-reload'])
        .optional()
    })
    .optional(),
  find: z
    .object({
      open: z.boolean(),
      query: z.string(),
      activeMatch: z.number().int(),
      totalMatches: z.number().int()
    })
    .optional(),
  draft: z.object({ hasDraft: z.boolean(), annotationId: z.string().optional() }).optional(),
  zoomLevel: z.number().finite().optional(),
  annotations: z
    .array(
      z.object({
        id: z.string(),
        comment: z.string(),
        intent: z.enum(['fix', 'change', 'question', 'approve']),
        priority: z.enum(['blocking', 'important', 'suggestion']),
        createdAt: z.string()
      })
    )
    .optional(),
  history: z
    .array(z.object({ url: z.string(), title: z.string(), lastVisitedAt: z.number() }))
    .optional(),
  preset: BrowserViewerPreset.nullable().optional()
})
export type BrowserViewerResult = z.infer<typeof BrowserViewerResultSchema>
export type BrowserViewerResponse = { id: string } & (
  | { ok: true; result: BrowserViewerResult }
  | { ok: false; error: string }
)
export type BrowserViewerEventApi = {
  onBrowserViewerRequest?: (callback: (request: BrowserViewerRequest) => void) => () => void
  respondBrowserViewer?: (response: BrowserViewerResponse) => void
}
