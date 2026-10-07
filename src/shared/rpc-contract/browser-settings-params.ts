import { z } from 'zod'
import { BROWSER_PAGE_ZOOM_LEVELS } from '../browser-page-zoom'

export const BrowserSettingsCommand = z.discriminatedUnion('action', [
  z.object({
    action: z.enum([
      'status',
      'homepage-save',
      'profile-dialog-open',
      'profile-dialog-close',
      'profile-dialog-status',
      'profile-create',
      'cookies-scroll',
      'computer-use-open'
    ])
  }),
  z.object({ action: z.literal('homepage-draft'), value: z.string().max(2048) }),
  z.object({ action: z.literal('profile-name'), value: z.string().max(50) }),
  z.object({
    action: z.literal('search-engine'),
    engine: z.enum(['google', 'duckduckgo', 'bing', 'kagi'])
  }),
  z.object({
    action: z.literal('zoom'),
    value: z
      .number()
      .finite()
      .refine((value) => BROWSER_PAGE_ZOOM_LEVELS.some((level) => level === value))
  }),
  z.object({
    action: z.literal('profile-select'),
    profileId: z.string().min(1).max(256).nullable()
  }),
  z.object({ action: z.literal('host-select'), hostId: z.string().min(1).max(256) })
])
export type BrowserSettingsCommand = z.infer<typeof BrowserSettingsCommand>
export const BrowserSettingsState = z.object({
  hostId: z.string().optional(),
  defaultProfileId: z.string().nullable().optional(),
  homePageDraftPresent: z.boolean().optional(),
  homePageDraftSaved: z.boolean().optional(),
  dialogOpen: z.boolean().optional(),
  profileNamePresent: z.boolean().optional(),
  creating: z.boolean().optional()
})
export type BrowserSettingsState = z.infer<typeof BrowserSettingsState>
