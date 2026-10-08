import { z } from 'zod'
import { BrowserClientPageTarget } from './browser-client-page-target'
export const BrowserClientNavigationTarget = BrowserClientPageTarget.extend({
  worktreeId: z.string().min(1),
  page: z.string().min(1),
  environmentId: z.string().min(1)
})
export type BrowserClientNavigationTarget = z.infer<typeof BrowserClientNavigationTarget>
export const BrowserClientNavigationUrl = z
  .string()
  .url()
  .refine((value) => {
    try {
      const url = new URL(value)
      return (
        (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password
      )
    } catch {
      return false
    }
  })
export const BrowserClientNavigationViewerCommand = z.object({
  viewer: z.literal('host'),
  operation: z.literal('client-navigation'),
  target: BrowserClientNavigationTarget,
  url: BrowserClientNavigationUrl
})
export const BrowserClientNavigationReceipt = BrowserClientNavigationTarget.extend({
  url: z.string().min(1),
  metadataRevision: z.number().int().positive(),
  loading: z.literal(false),
  accepted: z.literal(true)
})
export type BrowserClientNavigationReceipt = z.infer<typeof BrowserClientNavigationReceipt>
