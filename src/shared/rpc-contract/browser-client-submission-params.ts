import { z } from 'zod'
import {
  BrowserClientNavigationTarget,
  BrowserClientNavigationReceipt
} from './browser-client-navigation-params'
export const BrowserClientSubmissionValue = z.string().trim().min(1).max(8192)
export const BrowserClientSubmissionViewerCommand = z.object({
  viewer: z.literal('host'),
  operation: z.literal('client-submission'),
  entry: z.literal('address-bar'),
  target: BrowserClientNavigationTarget,
  value: BrowserClientSubmissionValue
})
export const BrowserClientSubmissionReceipt = BrowserClientNavigationReceipt
export type BrowserClientSubmissionReceipt = z.infer<typeof BrowserClientSubmissionReceipt>
