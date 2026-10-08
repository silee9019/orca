import { z } from 'zod'
export const BrowserGroupUiTarget = z.object({
  worktree: z.string().min(1),
  group: z.string().min(1)
})
export type BrowserGroupUiTarget = z.infer<typeof BrowserGroupUiTarget>
export const BrowserGroupUiAction = z.enum(['new-browser', 'status'])
export type BrowserGroupUiAction = z.infer<typeof BrowserGroupUiAction>
export const BrowserGroupUiState = z.object({
  target: BrowserGroupUiTarget,
  tabOrder: z.array(z.string()),
  activeTab: z.string().nullable(),
  activeWorkspace: z.string().nullable(),
  activeGroup: z.string().nullable(),
  activeType: z.string().nullable(),
  createdWorkspace: z.string().optional(),
  addressFocusRequested: z.boolean().optional(),
  guestRegistrationVerified: z.literal(false)
})
export type BrowserGroupUiState = z.infer<typeof BrowserGroupUiState>
