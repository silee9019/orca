import { z } from 'zod'
export const BrowserGrabActionKey = z.enum(['copy', 'screenshot'])
export type BrowserGrabActionKey = z.infer<typeof BrowserGrabActionKey>
export const BrowserGrabActionReceipt = z.object({
  copied: z.literal(true),
  source: z.enum(['hover', 'selection']),
  state: z.enum(['idle', 'armed', 'awaiting', 'confirming']),
  hasSelection: z.boolean(),
  hasScreenshot: z.boolean(),
  contextMenu: z.boolean()
})
export type BrowserGrabActionReceipt = z.infer<typeof BrowserGrabActionReceipt>
