import type { BrowserViewerCommand } from '../../../shared/rpc-contract/browser-viewer-params'

const BROWSER_PLACEMENT_VIEWER_OPERATIONS = [
  'tab-drop',
  'tab-drag-cancel',
  'client-history-document',
  'client-input-feedback',
  'titlebar-activate-paired',
  'toolbar-external',
  'server-reopen',
  'browser-import-hint',
  'banner',
  'egress',
  'overlay-focus',
  'client-hosted-row',
  'client-address',
  'client-find',
  'client-history',
  'client-reload',
  'client-submission',
  'client-document',
  'client-staged-document',
  'client-deferred',
  'new-tab-paired',
  'new-tab',
  'client-navigation',
  'client-markup',
  'take-back',
  'observe-page',
  'computer-permissions',
  'grab-toast',
  'webauthn-dialog-focus',
  'webauthn-dialog',
  'load-failure',
  'workspace-file-open',
  'workspace-port-open',
  'palette-select',
  'floating-browser',
  'remote-picker',
  'linked-browser'
] as const

type BrowserPlacementPreRuntimeCommand = Extract<
  BrowserViewerCommand,
  { operation: (typeof BROWSER_PLACEMENT_VIEWER_OPERATIONS)[number] }
>

export type BrowserPlacementViewerCommand = Extract<
  BrowserViewerCommand,
  {
    operation:
      | (typeof BROWSER_PLACEMENT_VIEWER_OPERATIONS)[number]
      | 'viewport-pan'
      | 'markup-hint'
      | 'markup-editor'
      | 'markup'
      | 'browser-setup-guide'
      | 'browser-feature-wall'
  }
>

export function isBrowserPlacementViewerCommand(command: {
  operation: string
}): command is BrowserPlacementPreRuntimeCommand {
  return BROWSER_PLACEMENT_VIEWER_OPERATIONS.some((operation) => command.operation === operation)
}
