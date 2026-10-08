import { z } from 'zod'
export const BrowserProfileUiCommand = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('import-browser'),
    profile: z.string().min(1).max(256).optional(),
    family: z.string().min(1).max(256),
    browserProfile: z.string().min(1).max(1024).optional()
  }),
  z.object({
    action: z.literal('import-file'),
    filePath: z.string().min(1).max(32768),
    profile: z.string().min(1).max(256).optional()
  }),
  z.object({ action: z.literal('select'), profile: z.string().min(1).max(256) }),
  z.object({ action: z.literal('new-name'), name: z.string().max(50) }),
  z.object({
    action: z.enum([
      'settings-open',
      'detect-browsers',
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
  cookieImportTargetGuard: z.literal(1).optional(),
  settings: z
    .object({
      activeView: z.literal('settings'),
      pane: z.literal('browser'),
      repoId: z.null(),
      search: z.literal('')
    })
    .optional(),
  detection: z
    .object({
      loaded: z.boolean(),
      serviceVerified: z.literal(false),
      browsers: z.array(
        z.object({
          family: z.string(),
          label: z.string(),
          selectedProfile: z.string(),
          profiles: z.array(z.object({ name: z.string(), directory: z.string() }))
        })
      )
    })
    .optional(),
  cookieImport: z
    .object({
      profile: z.string(),
      imported: z.number().int().nonnegative(),
      skipped: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
      executionHost: z.literal('local'),
      executionMachine: z.literal('client')
    })
    .optional(),
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
