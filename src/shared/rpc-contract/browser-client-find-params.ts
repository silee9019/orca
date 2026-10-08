import { z } from 'zod'
import { BrowserClientNavigationTarget } from './browser-client-navigation-params'
import { BrowserFindAction, BrowserFindQuery, BrowserFindState } from './browser-find-params'
export const BrowserClientFindViewerCommand = z.object({
  viewer: z.literal('host'),
  operation: z.literal('client-find'),
  target: BrowserClientNavigationTarget,
  action: BrowserFindAction,
  query: BrowserFindQuery.optional()
})
export const BrowserClientFindReceipt = z.object({
  target: BrowserClientNavigationTarget,
  state: BrowserFindState
})
