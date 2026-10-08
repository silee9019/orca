import { z } from 'zod'
export const BrowserReloadMenuAction = z.enum(['open', 'close', 'status'])
export type BrowserReloadMenuAction = z.infer<typeof BrowserReloadMenuAction>
export const BrowserReloadMenuState = z.object({ open: z.boolean() })
export type BrowserReloadMenuState = z.infer<typeof BrowserReloadMenuState>
