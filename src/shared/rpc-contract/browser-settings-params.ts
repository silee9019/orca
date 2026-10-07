import { z } from 'zod'
import { BROWSER_PAGE_ZOOM_LEVELS } from '../browser-page-zoom'

const cookieTarget = {
  profileId: z.string().min(1).max(256),
  surface: z.enum(['profile-row', 'browser-use'])
}
export const BrowserSettingsCommand = z.discriminatedUnion('action', [
  z.object({
    ...cookieTarget,
    action: z.enum(['detect-browsers', 'profile-status', 'cookies-configure'])
  }),
  z.object({
    ...cookieTarget,
    action: z.literal('cookies-import-browser'),
    browserFamily: z.string().min(1).max(128),
    browserProfile: z
      .string()
      .min(1)
      .max(256)
      .refine((value) => !/[/\\]/.test(value) && !value.includes('..'))
      .optional(),
    confirmation: z.string().min(1).max(256)
  }),
  z.object({
    ...cookieTarget,
    action: z.literal('cookies-import-file'),
    filePath: z.string().min(1).max(4096),
    confirmation: z.string().min(1).max(256)
  }),
  z.object({ action: z.literal('browser-identity-set'), mode: z.enum(['clean', 'native']) }),
  z.object({ action: z.literal('browser-use-enabled'), enabled: z.boolean() }),
  z.object({
    action: z.literal('browser-use-copy-example'),
    index: z.number().int().min(0).max(2)
  }),
  z.object({
    action: z.enum([
      'browser-use-status',
      'browser-use-refresh',
      'browser-use-install-intent',
      'browser-use-configure',
      'browser-use-computer'
    ])
  }),
  z.object({
    action: z.enum(['profile-delete', 'default-cookies-clear']),
    profileId: z.string().min(1).max(256),
    confirmation: z.string().min(1).max(256)
  }),
  z.object({
    action: z.enum([
      'status',
      'homepage-save',
      'kagi-clear',
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
  identityConfiguredMode: z.enum(['clean', 'native']).nullable().optional(),
  identityAppliedMode: z.enum(['clean', 'native']).nullable().optional(),
  identityRestartRequired: z.boolean().optional(),
  identitySaving: z.boolean().optional(),
  identityErrorPresent: z.boolean().optional(),
  kagiConfigured: z.boolean().optional(),
  kagiDraftPresent: z.boolean().optional(),
  clipboardCopied: z.boolean().optional(),
  cookiesScrolled: z.boolean().optional(),
  browserUseEnabled: z.boolean().optional(),
  skillDetected: z.boolean().optional(),
  skillLoading: z.boolean().optional(),
  skillScanSucceeded: z.boolean().optional(),
  profileId: z.string().optional(),
  importStatus: z.enum(['idle', 'importing', 'success', 'error']).nullable().optional(),
  importedCookieCount: z.number().int().nonnegative().optional(),
  detectedBrowserFamilies: z.array(z.string()).optional(),
  cookieSourcePresent: z.boolean().optional(),
  hostId: z.string().optional(),
  defaultProfileId: z.string().nullable().optional(),
  homePageDraftPresent: z.boolean().optional(),
  homePageDraftSaved: z.boolean().optional(),
  dialogOpen: z.boolean().optional(),
  profileNamePresent: z.boolean().optional(),
  creating: z.boolean().optional()
})
export type BrowserSettingsState = z.infer<typeof BrowserSettingsState>
