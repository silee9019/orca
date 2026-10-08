import { z } from 'zod'
export const BrowserImportHintCommand = z
  .object({
    hostId: z.string().min(1).max(256),
    pageId: z.string().min(1),
    profileId: z.string().min(1),
    confirm: z.literal('hide-browser-import-hint').optional(),
    filePath: z.string().min(1).max(32768).optional(),
    confirmProfile: z.string().min(1).optional(),
    action: z.enum([
      'status',
      'open',
      'close',
      'menu-open',
      'menu-close',
      'settings',
      'hide',
      'import-file'
    ])
  })
  .refine((command) => command.action !== 'hide' || command.confirm === 'hide-browser-import-hint')
  .refine(
    (command) =>
      command.action !== 'import-file' ||
      (command.hostId === 'local' &&
        !!command.filePath &&
        command.confirmProfile === command.profileId)
  )
export type BrowserImportHintCommand = z.infer<typeof BrowserImportHintCommand>
export const BrowserImportHintState = z.object({
  open: z.boolean(),
  menuOpen: z.boolean(),
  detectionSettled: z.boolean(),
  settingsOpened: z.boolean(),
  hidden: z.boolean().optional(),
  persisted: z.boolean().optional(),
  imported: z
    .object({
      totalCookies: z.number().int().nonnegative(),
      importedCookies: z.number().int().nonnegative(),
      skippedCookies: z.number().int().nonnegative()
    })
    .optional()
})
export type BrowserImportHintState = z.infer<typeof BrowserImportHintState>
