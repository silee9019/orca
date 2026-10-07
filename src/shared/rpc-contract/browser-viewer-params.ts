import { z } from 'zod'
import { BROWSER_VIEWPORT_PRESETS } from '../browser-viewport-presets'
import { GRAB_BUDGET } from '../browser-grab-types'

export const BrowserViewerPreset = z.enum(BROWSER_VIEWPORT_PRESETS.map((preset) => preset.id))

export const BrowserGrabViewerAction = z.enum(['start', 'cancel', 'rearm', 'exit', 'status'])
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
  z
    .object({
      viewer,
      operation: z.literal('grab'),
      page,
      action: BrowserGrabViewerAction,
      intent: z.enum(['copy', 'annotate']).optional()
    })
    .refine((command) => command.action !== 'start' || command.intent !== undefined, {
      message: 'Grab start requires an explicit intent'
    }),
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
