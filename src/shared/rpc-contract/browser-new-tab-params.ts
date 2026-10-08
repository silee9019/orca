import { z } from 'zod'
export const BrowserNewTabTarget = z.object({
  worktree: z.string().min(1),
  group: z.string().min(1).optional()
})
export type BrowserNewTabTarget = z.infer<typeof BrowserNewTabTarget>
export const BrowserNewTabState = z.object({
  target: BrowserNewTabTarget,
  workspace: z.string(),
  page: z.string(),
  unifiedTab: z.string(),
  placement: z.enum(['workspace', 'floating']),
  addressFocusRequested: z.literal(true),
  guestRegistrationVerified: z.literal(false)
})
export type BrowserNewTabState = z.infer<typeof BrowserNewTabState>
