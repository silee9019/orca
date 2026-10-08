import { z } from 'zod'
export const BrowserOverlayFocusCommand = z.object({
  worktreeId: z.string().min(1),
  workspaceId: z.string().min(1),
  groupId: z.string().min(1),
  executionHostId: z.union([
    z.literal('local'),
    z.templateLiteral(['ssh:', z.string().min(1)]),
    z.templateLiteral(['runtime:', z.string().min(1)])
  ])
})
export type BrowserOverlayFocusCommand = z.infer<typeof BrowserOverlayFocusCommand>
export const BrowserOverlayFocusState = BrowserOverlayFocusCommand.extend({
  activeTabId: z.string().min(1),
  focused: z.literal(true)
})
export type BrowserOverlayFocusState = z.infer<typeof BrowserOverlayFocusState>
