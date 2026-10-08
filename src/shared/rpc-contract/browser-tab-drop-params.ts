import { z } from 'zod'
import { BrowserTabUiTarget } from './browser-tab-ui-params'

export const BrowserTabDropTarget = BrowserTabUiTarget.extend({
  environmentId: z.string().min(1).nullable()
})
export type BrowserTabDropTarget = z.infer<typeof BrowserTabDropTarget>
export const BrowserTabDropDestination = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('tab'),
    group: z.string().min(1),
    tab: z.string().min(1),
    side: z.enum(['left', 'right'])
  }),
  z.object({ kind: z.literal('pane'), group: z.string().min(1) }),
  z.object({
    kind: z.literal('split'),
    group: z.string().min(1),
    direction: z.enum(['left', 'right', 'up', 'down'])
  })
])
export type BrowserTabDropDestination = z.infer<typeof BrowserTabDropDestination>
export const BrowserTabDropReceipt = z.object({
  target: BrowserTabDropTarget,
  destination: BrowserTabDropDestination,
  moved: z.literal(true),
  group: z.string().min(1),
  order: z.array(z.string()),
  activeGroup: z.string().nullable(),
  activeTabs: z.record(z.string(), z.string().nullable()),
  hostMoveAcknowledged: z.boolean(),
  nativePointerVerified: z.literal(false)
})
export type BrowserTabDropReceipt = z.infer<typeof BrowserTabDropReceipt>
export const BrowserTabDropViewerCommand = z.object({
  viewer: z.literal('host'),
  operation: z.literal('tab-drop'),
  target: BrowserTabDropTarget,
  destination: BrowserTabDropDestination
})

export const BrowserTabDragCancelReceipt = z.object({
  target: BrowserTabDropTarget,
  cancelled: z.literal(true),
  dragActive: z.literal(false),
  hoverVisible: z.literal(false),
  ownerPassthroughHeld: z.literal(false),
  ownerMissedEndFallbackInstalled: z.literal(false),
  passthroughActiveAfter: z.boolean(),
  activeGroup: z.string().nullable(),
  activeTabs: z.record(z.string(), z.string().nullable()),
  nativePointerVerified: z.literal(false)
})
export type BrowserTabDragCancelReceipt = z.infer<typeof BrowserTabDragCancelReceipt>
export const BrowserTabDragCancelViewerCommand = z.object({
  viewer: z.literal('host'),
  operation: z.literal('tab-drag-cancel'),
  target: BrowserTabDropTarget
})
export const BrowserTabDropViewerCommands = [
  BrowserTabDropViewerCommand,
  BrowserTabDragCancelViewerCommand
] as const
