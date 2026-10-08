import { z } from 'zod'
import { BrowserClientNavigationTarget } from './browser-client-navigation-params'
export const BrowserClientReloadViewerCommand = z.object({
  viewer: z.literal('host'),
  operation: z.literal('client-reload'),
  target: BrowserClientNavigationTarget,
  entry: z.literal('context-menu')
})
export const BrowserClientReloadReceipt = z.object({
  target: BrowserClientNavigationTarget,
  accepted: z.literal(true),
  loading: z.boolean(),
  completionObserved: z.literal(false)
})
export type BrowserClientReloadReceipt = z.infer<typeof BrowserClientReloadReceipt>
