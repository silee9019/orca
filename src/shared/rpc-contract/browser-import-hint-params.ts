import { z } from 'zod'
export const BrowserImportHintCommand = z
  .object({
    hostId: z.string().min(1).max(256),
    pageId: z.string().min(1),
    profileId: z.string().min(1),
    confirm: z.literal('hide-browser-import-hint').optional(),
    action: z.enum(['status', 'open', 'close', 'menu-open', 'menu-close', 'settings', 'hide'])
  })
  .refine((command) => command.action !== 'hide' || command.confirm === 'hide-browser-import-hint')
export type BrowserImportHintCommand = z.infer<typeof BrowserImportHintCommand>
export const BrowserImportHintState = z.object({
  open: z.boolean(),
  menuOpen: z.boolean(),
  detectionSettled: z.boolean(),
  settingsOpened: z.boolean(),
  hidden: z.boolean().optional(),
  persisted: z.boolean().optional()
})
export type BrowserImportHintState = z.infer<typeof BrowserImportHintState>
