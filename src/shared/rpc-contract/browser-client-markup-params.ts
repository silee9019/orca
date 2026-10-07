import { z } from 'zod'
import { BrowserClientPageTarget } from './browser-client-page-target'
import { openEnum } from '../zod-salvage'
export const BrowserClientMarkupTarget = BrowserClientPageTarget.extend({
  worktreeId: z.string().min(1),
  page: z.string().min(1),
  environmentId: z.string().min(1)
})
export type BrowserClientMarkupTarget = z.infer<typeof BrowserClientMarkupTarget>
export const BrowserClientMarkupAction = z.enum(['start', 'cancel', 'status'])
export type BrowserClientMarkupAction = z.infer<typeof BrowserClientMarkupAction>
export const BrowserClientMarkupReceipt = BrowserClientMarkupTarget.extend({
  action: BrowserClientMarkupAction,
  state: openEnum(['idle', 'capturing', 'drawing', 'composing', 'unknown'], 'unknown'),
  hasImage: z.boolean(),
  accepted: z.literal(true)
})
export type BrowserClientMarkupReceipt = z.infer<typeof BrowserClientMarkupReceipt>
