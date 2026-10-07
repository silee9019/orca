import { z } from 'zod'
export const BrowserDownloadAction = z.enum(['open', 'show', 'dismiss', 'status'])
export type BrowserDownloadAction = z.infer<typeof BrowserDownloadAction>
export const BrowserDownloadReceipt = z.object({
  downloadId: z.string(),
  action: BrowserDownloadAction,
  present: z.boolean(),
  status: z.enum(['downloading', 'completed', 'failed', 'canceled']).optional(),
  accepted: z.boolean()
})
export type BrowserDownloadReceipt = z.infer<typeof BrowserDownloadReceipt>
