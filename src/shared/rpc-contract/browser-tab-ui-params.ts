import { z } from 'zod'
export const BrowserTabUiTarget = z.object({
  workspace: z.string().min(1),
  worktree: z.string().min(1),
  group: z.string().min(1),
  unifiedTab: z.string().min(1)
})
export type BrowserTabUiTarget = z.infer<typeof BrowserTabUiTarget>
export const BrowserTabUiAction = z.enum([
  'open-external',
  'menu-open',
  'menu-close',
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
export const BrowserTabUiPoint = z.object({
  x: z.number().finite().min(0).max(65535),
  y: z.number().finite().min(0).max(65535)
})
export type BrowserTabUiPoint = z.infer<typeof BrowserTabUiPoint>
export const BrowserTabUiState = z.object({
  target: BrowserTabUiTarget,
  menu: z.object({ open: z.boolean(), point: BrowserTabUiPoint }).optional(),
  exists: z.boolean(),
  pinned: z.boolean(),
  activeGroup: z.string().nullable(),
  activeTab: z.string().nullable(),
  activeWorkspace: z.string().nullable(),
  activeType: z.string().nullable(),
  tabOrder: z.array(z.string()),
  closedTabs: z.array(z.string()),
  externalOpenAccepted: z.literal(true).optional(),
  externalWindowVerified: z.literal(false).optional(),
  duplicatedWorkspace: z.string().optional(),
  guestRegistrationVerified: z.literal(false)
})
export type BrowserTabUiState = z.infer<typeof BrowserTabUiState>
