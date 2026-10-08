import { z } from 'zod'
import { BrowserClientNavigationTarget } from './browser-client-navigation-params'
import { BrowserClientStagedTarget } from './browser-client-deferred-params'
export const BrowserClientInputFeedbackSource = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('materialized'), target: BrowserClientNavigationTarget }),
  z.object({ kind: z.literal('staged'), target: BrowserClientStagedTarget })
])
export const BrowserClientInputFeedbackCommand = z.object({
  viewer: z.literal('host'),
  operation: z.literal('client-input-feedback'),
  source: BrowserClientInputFeedbackSource,
  value: z.string().max(8192)
})
export const BrowserClientInputFeedbackState = z.object({
  source: BrowserClientInputFeedbackSource,
  inputRejected: z.literal(true),
  kind: z.enum(['invalid', 'local-file']),
  loadErrorCode: z.literal(0),
  navigationStarted: z.literal(false)
})
export type BrowserClientInputFeedbackState = z.infer<typeof BrowserClientInputFeedbackState>
