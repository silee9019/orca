import { z } from 'zod'
const groupId = z.string().min(1).max(256)
export const FloatingBrowserCommand = z.discriminatedUnion('action', [
  z.object({ action: z.literal('new'), groupId }),
  z.object({
    action: z.literal('duplicate'),
    groupId,
    browserTabId: z.string().min(1).max(256),
    sourceUnifiedTabId: z.string().min(1).max(256)
  })
])
export type FloatingBrowserCommand = z.infer<typeof FloatingBrowserCommand>
export const FloatingBrowserState = z.object({
  browserTabId: z.string(),
  pageId: z.string(),
  unifiedTabId: z.string(),
  groupId: z.string(),
  insertionIndex: z.number().int().nonnegative(),
  active: z.boolean(),
  addressFocusRequested: z.boolean(),
  profilePreserved: z.boolean(),
  partitionPreserved: z.boolean()
})
export type FloatingBrowserState = z.infer<typeof FloatingBrowserState>
