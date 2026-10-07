import { z } from 'zod'
export const LinkedBrowserCommand = z.object({
  workspaceId: z.string().min(1).max(1024),
  executionHostId: z.string().min(1).max(512),
  runtimeEnvironmentId: z.string().min(1).max(256).optional(),
  surface: z.enum(['card-identity', 'card-details', 'card-title', 'activity']),
  kind: z.enum(['issue', 'review']),
  number: z.number().int().positive(),
  url: z.string().url().max(8192)
})
export type LinkedBrowserCommand = z.infer<typeof LinkedBrowserCommand>
export const LinkedBrowserState = z.object({
  browserTabId: z.string(),
  pageId: z.string(),
  groupId: z.string(),
  hoverCloseRequested: z.boolean(),
  active: z.boolean(),
  addressFocusRequested: z.boolean()
})
export type LinkedBrowserState = z.infer<typeof LinkedBrowserState>
