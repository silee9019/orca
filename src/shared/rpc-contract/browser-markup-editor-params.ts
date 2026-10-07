import { BrowserClientMarkupTarget } from './browser-client-markup-params'
import { z } from 'zod'
export const BrowserMarkupTool = z.enum([
  'pen',
  'highlight',
  'arrow',
  'rect',
  'ellipse',
  'text',
  'eraser'
])
export const BrowserMarkupNormalizedPoints = z
  .array(
    z.object({
      x: z.number().finite().min(0).max(1),
      y: z.number().finite().min(0).max(1)
    })
  )
  .min(1)
  .max(4096)
export const BrowserMarkupEditorCommand = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('gesture'),
    points: BrowserMarkupNormalizedPoints,
    cancel: z.boolean()
  }),
  z.object({ action: z.literal('text-commit'), text: z.string().max(16_384) }),
  z.object({ action: z.literal('text-cancel') }),
  z.object({ action: z.literal('tool'), value: BrowserMarkupTool }),
  z.object({ action: z.literal('color'), value: z.string().max(16) }),
  z.object({ action: z.literal('width'), value: z.number().finite() }),
  z.object({ action: z.literal('font-size'), value: z.number().finite() }),
  z.object({ action: z.enum(['undo', 'redo', 'clear', 'status', 'copy']) })
])
export type BrowserMarkupEditorCommand = z.infer<typeof BrowserMarkupEditorCommand>
export const BrowserMarkupEditorState = z.object({
  clientTarget: BrowserClientMarkupTarget.optional(),
  tool: BrowserMarkupTool,
  color: z.string(),
  width: z.number(),
  fontSize: z.number(),
  shapeCount: z.number().int().nonnegative(),
  pendingText: z.boolean(),
  canUndo: z.boolean(),
  canRedo: z.boolean(),
  gestureActive: z.boolean().optional(),
  copied: z.literal(true).optional()
})
export type BrowserMarkupEditorState = z.infer<typeof BrowserMarkupEditorState>
