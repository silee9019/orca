import { z } from 'zod'
import { redactKagiSessionToken } from '../browser-url'
import { BrowserClientNavigationUrl } from './browser-client-navigation-params'
export const BrowserClientStagedTarget = z.object({
  worktreeId: z.string().min(1),
  page: z.string().min(1),
  environmentId: z.string().min(1),
  remotePageId: z.string().min(1)
})
export type BrowserClientStagedTarget = z.infer<typeof BrowserClientStagedTarget>
export const BrowserClientDeferredValue = z.string().trim().min(1).max(8192)
export const BrowserClientDeferredViewerCommand = z.object({
  viewer: z.literal('host'),
  operation: z.literal('client-deferred'),
  entry: z.literal('address-bar-staged'),
  target: BrowserClientStagedTarget,
  value: BrowserClientDeferredValue
})
export const BrowserClientDeferredReceipt = z.object({
  target: BrowserClientStagedTarget,
  queued: z.literal(true),
  completionObserved: z.literal(false),
  hostPlacementKnown: z.literal(false),
  url: BrowserClientNavigationUrl.transform(redactKagiSessionToken),
  queuedUntil: z
    .number()
    .positive()
    .refine((value) => value > Date.now())
})
export type BrowserClientDeferredReceipt = z.infer<typeof BrowserClientDeferredReceipt>
