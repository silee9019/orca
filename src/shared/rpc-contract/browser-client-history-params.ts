import { z } from 'zod'
import { redactKagiSessionToken } from '../browser-url'
import {
  BrowserClientNavigationTarget,
  BrowserClientNavigationUrl
} from './browser-client-navigation-params'
import { ORCA_BROWSER_BLANK_URL } from '../constants'
export const BrowserClientHistoryViewerCommand = z.object({
  viewer: z.literal('host'),
  operation: z.literal('client-history'),
  target: BrowserClientNavigationTarget,
  action: z.enum(['back', 'forward'])
})
export type BrowserClientHistoryViewerCommand = z.infer<typeof BrowserClientHistoryViewerCommand>
export const BrowserClientHistoryReceipt = z.object({
  target: BrowserClientNavigationTarget,
  action: z.enum(['back', 'forward']),
  accepted: z.literal(true),
  completionObserved: z.literal(false),
  observedUrl: z
    .union([
      BrowserClientNavigationUrl.max(32768),
      z.literal(''),
      z.literal('about:blank'),
      z.literal(ORCA_BROWSER_BLANK_URL),
      z.url({ protocol: /^file$/ }).max(32768)
    ])
    .transform(redactKagiSessionToken),
  loading: z.boolean()
})
export type BrowserClientHistoryReceipt = z.infer<typeof BrowserClientHistoryReceipt>
