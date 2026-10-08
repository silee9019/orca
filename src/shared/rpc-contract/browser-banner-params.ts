import { z } from 'zod'
export const BrowserBannerCommand = z.object({
  page: z.string().min(1),
  worktreeId: z.string().min(1),
  action: z.enum(['resource-dismiss', 'cancel-grab', 'send-menu-open', 'send-menu-close', 'status'])
})
export type BrowserBannerCommand = z.infer<typeof BrowserBannerCommand>
export const BrowserBannerState = z.object({
  page: z.string().min(1),
  worktreeId: z.string().min(1),
  hasResourceNotice: z.boolean(),
  hasPendingAnnotation: z.boolean(),
  grabState: z.enum(['idle', 'armed', 'awaiting', 'confirming', 'error']),
  sendMenuOpen: z.boolean(),
  cancellationAccepted: z.literal(true).optional()
})
export type BrowserBannerState = z.infer<typeof BrowserBannerState>
