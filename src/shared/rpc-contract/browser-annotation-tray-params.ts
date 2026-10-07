import { z } from 'zod'
export const BrowserAnnotationTrayAction = z.enum([
  'open',
  'close',
  'copy',
  'clear',
  'send-menu-open',
  'send-menu-close',
  'status'
])
export type BrowserAnnotationTrayAction = z.infer<typeof BrowserAnnotationTrayAction>
export const BrowserAnnotationTrayState = z.object({
  noteCount: z.number().int().nonnegative(),
  open: z.boolean(),
  copied: z.boolean(),
  sendMenuOpen: z.boolean()
})
export type BrowserAnnotationTrayState = z.infer<typeof BrowserAnnotationTrayState>
