import { z } from 'zod'
export const BrowserProfileUiCommand = z.discriminatedUnion('action', [
  z.object({ action: z.literal('select'), profile: z.string().min(1).max(256) }),
  z.object({ action: z.literal('new-name'), name: z.string().max(50) }),
  z.object({
    action: z.enum([
      'menu-open',
      'menu-close',
      'switch-cancel',
      'switch-confirm',
      'new-open',
      'new-cancel',
      'new-create',
      'status'
    ])
  })
])
export type BrowserProfileUiCommand = z.infer<typeof BrowserProfileUiCommand>
export const BrowserProfileUiState = z.object({
  workspace: z.string(),
  profile: z.string(),
  partition: z.string().nullable(),
  menuOpen: z.boolean(),
  pendingProfile: z.string().nullable(),
  newDialogOpen: z.boolean(),
  newName: z.string(),
  creating: z.boolean(),
  guestRegistrationVerified: z.literal(false)
})
export type BrowserProfileUiState = z.infer<typeof BrowserProfileUiState>
