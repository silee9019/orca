import { z } from 'zod'
export const BrowserPaletteSelection = z
  .object({
    executionHostId: z.union([
      z.literal('local'),
      z.templateLiteral(['ssh:', z.string().min(1)]),
      z.templateLiteral(['runtime:', z.string().min(1)])
    ]),
    worktreeId: z.string().min(1),
    workspaceId: z.string().min(1),
    pageId: z.string().min(1)
  })
  .strict()
export type BrowserPaletteSelection = z.infer<typeof BrowserPaletteSelection>
export const BrowserPaletteState = BrowserPaletteSelection.extend({
  focusTarget: z.enum(['address-bar', 'webview']),
  focusApplied: z.literal(true)
})
export type BrowserPaletteState = z.infer<typeof BrowserPaletteState>
