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
export const BrowserMarkupEditorCommand = z.discriminatedUnion('action', [
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
  tool: BrowserMarkupTool,
  color: z.string(),
  width: z.number(),
  fontSize: z.number(),
  shapeCount: z.number().int().nonnegative(),
  pendingText: z.boolean(),
  canUndo: z.boolean(),
  canRedo: z.boolean(),
  copied: z.literal(true).optional()
})
export type BrowserMarkupEditorState = z.infer<typeof BrowserMarkupEditorState>
