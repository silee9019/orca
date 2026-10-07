import { z } from 'zod'
export const BrowserTabUiTarget = z.object({
  workspace: z.string().min(1),
  worktree: z.string().min(1),
  group: z.string().min(1),
  unifiedTab: z.string().min(1)
})
export type BrowserTabUiTarget = z.infer<typeof BrowserTabUiTarget>
export const BrowserTabUiAction = z.enum([
  'activate',
  'close',
  'close-others',
  'close-left',
  'close-right',
  'toggle-pin',
  'duplicate',
  'status'
])
export type BrowserTabUiAction = z.infer<typeof BrowserTabUiAction>
export const BrowserTabUiState = z.object({
  target: BrowserTabUiTarget,
  exists: z.boolean(),
  pinned: z.boolean(),
  activeGroup: z.string().nullable(),
  activeTab: z.string().nullable(),
  activeWorkspace: z.string().nullable(),
  activeType: z.string().nullable(),
  tabOrder: z.array(z.string()),
  closedTabs: z.array(z.string()),
  duplicatedWorkspace: z.string().optional(),
  guestRegistrationVerified: z.literal(false)
})
export type BrowserTabUiState = z.infer<typeof BrowserTabUiState>
