import { z } from 'zod'
export const BrowserGrabCopyPriorityArgs = z.object({ browserPageId: z.string().min(1).max(256) })
export const BrowserGrabCopyPriority = z.object({
  allowed: z.boolean(),
  guestFocused: z.boolean(),
  guestId: z.number().int().positive()
})
export type BrowserGrabCopyPriority = z.infer<typeof BrowserGrabCopyPriority>
