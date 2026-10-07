import { PluginMarketplaceViewerCommand } from './plugin-marketplace-viewer-params'
import { BrowserPaletteSelection } from './browser-palette-params'
import { RemoteFilePickerCommand } from './remote-file-picker-params'
import { LinkedBrowserCommand } from './linked-browser-params'
import { FloatingBrowserCommand } from './floating-browser-params'
import { BrowserNewTabTarget } from './browser-new-tab-params'
import { BrowserReloadMenuAction } from './browser-reload-menu-params'
import { BrowserAnnotationRowCommand } from './browser-annotation-row-params'
import { BrowserContextMenuAction } from './browser-context-menu-params'
import { BrowserTabUiTarget, BrowserTabUiAction, BrowserTabUiPoint } from './browser-tab-ui-params'
import { BrowserGroupUiTarget, BrowserGroupUiAction } from './browser-group-ui-params'
import { BrowserProfileUiCommand } from './browser-profile-ui-params'
import { z } from 'zod'
import { BrowserDocumentViewerParams } from './browser-document-params'
import { BrowserRemotePaneCommand } from './browser-remote-pane-params'
import { BrowserSettingsCommand } from './browser-settings-params'
import { BrowserAnnotationTrayAction } from './browser-annotation-tray-params'
import { BrowserAddressCommand } from './browser-address-params'
import { BrowserMarkupEditorCommand } from './browser-markup-editor-params'
import { BROWSER_VIEWPORT_PRESETS } from '../browser-viewport-presets'
import { GRAB_BUDGET } from '../browser-grab-types'

export const BrowserViewerPreset = z.enum(BROWSER_VIEWPORT_PRESETS.map((preset) => preset.id))

export const BrowserGrabViewerAction = z.enum([
  'start',
  'toggle',
  'cancel',
  'rearm',
  'exit',
  'status',
  'copy',
  'copy-screenshot'
])
export type BrowserGrabViewerAction = z.infer<typeof BrowserGrabViewerAction>

export const BrowserToolbarAction = z.enum([
  'back',
  'forward',
  'reload-button',
  'reload',
  'hard-reload'
])
export type BrowserToolbarAction = z.infer<typeof BrowserToolbarAction>

const page = z.string().min(1)
const viewer = z.literal('host')
export const BrowserViewerCommand = z.discriminatedUnion('operation', [
  z.object({
    viewer,
    operation: z.literal('plugin-marketplace'),
    command: PluginMarketplaceViewerCommand
  }),
  z.object({ viewer, operation: z.literal('palette-select'), selection: BrowserPaletteSelection }),
  z.object({ viewer, operation: z.literal('remote-picker'), command: RemoteFilePickerCommand }),
  z.object({ viewer, operation: z.literal('linked-browser'), command: LinkedBrowserCommand }),
  z.object({ viewer, operation: z.literal('floating-browser'), command: FloatingBrowserCommand }),
  BrowserDocumentViewerParams,
  z.object({
    viewer,
    operation: z.literal('remote-pane'),
    page,
    command: BrowserRemotePaneCommand
  }),
  z.object({
    viewer,
    operation: z.literal('browser-settings'),
    hostId: z.string().min(1).max(256),
    command: BrowserSettingsCommand
  }),
  z.object({ viewer, operation: z.literal('new-tab'), target: BrowserNewTabTarget }),
  z.object({ viewer, operation: z.literal('reload-menu'), page, action: BrowserReloadMenuAction }),
  z.object({
    viewer,
    operation: z.literal('context-menu'),
    page,
    action: BrowserContextMenuAction
  }),
  z.object({
    viewer,
    operation: z.literal('group-ui'),
    target: BrowserGroupUiTarget,
    action: BrowserGroupUiAction
  }),
  z
    .object({
      viewer,
      operation: z.literal('tab-ui'),
      target: BrowserTabUiTarget,
      action: BrowserTabUiAction,
      point: BrowserTabUiPoint.optional()
    })
    .refine((command) => command.action !== 'menu-open' || command.point !== undefined, {
      message: 'Menu open requires an explicit client point'
    }),
  z.object({ viewer, operation: z.literal('profile-ui'), page, command: BrowserProfileUiCommand }),
  z.object({
    viewer,
    operation: z.literal('annotation-row'),
    page,
    command: BrowserAnnotationRowCommand
  }),
  z.object({
    viewer,
    operation: z.literal('annotation-tray'),
    page,
    action: BrowserAnnotationTrayAction
  }),
  z.object({ viewer, operation: z.literal('address'), page, command: BrowserAddressCommand }),
  z.object({
    viewer,
    operation: z.literal('markup-editor'),
    page,
    command: BrowserMarkupEditorCommand
  }),
  z.object({
    viewer,
    operation: z.literal('markup'),
    page,
    action: z.enum(['start', 'cancel', 'status'])
  }),
  z
    .object({
      viewer,
      operation: z.literal('grab'),
      page,
      action: BrowserGrabViewerAction,
      intent: z.enum(['copy', 'annotate']).optional()
    })
    .refine(
      (command) =>
        (command.action !== 'start' && command.action !== 'toggle') || command.intent !== undefined,
      {
        message: 'Grab start/toggle requires an explicit intent'
      }
    ),
  z.object({
    viewer,
    operation: z.literal('toolbar-navigation'),
    page,
    action: BrowserToolbarAction
  }),
  z.object({
    viewer,
    operation: z.literal('find'),
    page,
    action: z.enum(['open', 'next', 'previous', 'close', 'status'])
  }),
  z.object({ viewer, operation: z.literal('find-query'), page, query: z.string().max(2048) }),
  z.object({
    viewer,
    operation: z.literal('zoom'),
    page,
    direction: z.enum(['in', 'out', 'reset'])
  }),
  z.object({ viewer, operation: z.literal('download-cancel'), downloadId: z.string().min(1) }),
  z.object({
    viewer,
    operation: z.literal('webauthn-respond'),
    requestId: z.string().min(1),
    credentialId: z.string().min(1).max(4096).nullable()
  }),
  z.object({ viewer, operation: z.literal('devtools-open'), page }),
  z.object({
    viewer,
    operation: z.literal('annotation-draft'),
    page,
    action: z.enum(['status', 'cancel'])
  }),
  z.object({
    viewer,
    operation: z.literal('annotation-add'),
    page,
    comment: z.string().max(GRAB_BUDGET.annotationCommentMaxLength),
    intent: z.enum(['fix', 'change', 'question', 'approve'])
  }),
  z.object({ viewer, operation: z.literal('annotation-list'), page }),
  z.object({
    viewer,
    operation: z.literal('annotation-update'),
    page,
    annotationId: z.string().min(1),
    comment: z.string().max(GRAB_BUDGET.annotationCommentMaxLength),
    intent: z.enum(['fix', 'change', 'question', 'approve'])
  }),
  z.object({
    viewer,
    operation: z.literal('annotation-delete'),
    page,
    annotationId: z.string().min(1)
  }),
  z.object({ viewer, operation: z.literal('annotation-clear'), page }),
  z.object({ viewer, operation: z.literal('history-list') }),
  z.object({ viewer, operation: z.literal('history-clear') }),
  z.object({
    viewer,
    operation: z.literal('viewport-preset'),
    page,
    preset: BrowserViewerPreset.nullable()
  })
])
export type BrowserViewerCommand = z.infer<typeof BrowserViewerCommand>
