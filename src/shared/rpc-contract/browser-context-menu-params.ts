import { z } from 'zod'
export const BrowserContextMenuAction = z.enum([
  'status',
  'close',
  'next',
  'previous',
  'first',
  'last',
  'copy-link',
  'copy-page-url',
  'copy-selection',
  'back',
  'forward',
  'reload',
  'open-link-external',
  'open-page-external',
  'open-link',
  'inspect'
])
export type BrowserContextMenuAction = z.infer<typeof BrowserContextMenuAction>
export const BrowserContextLinkTabState = z.object({
  workspace: z.string(),
  page: z.string(),
  unifiedTab: z.string(),
  group: z.string(),
  tabOrder: z.array(z.string()),
  activated: z.literal(false),
  guestRegistrationVerified: z.literal(false)
})
export type BrowserContextLinkTabState = z.infer<typeof BrowserContextLinkTabState>
export const BrowserContextMenuState = z.object({
  devToolsRequested: z.literal(true).optional(),
  devToolsWindowVerified: z.literal(false).optional(),
  linkTab: BrowserContextLinkTabState.optional(),
  externalOpened: z.literal(true).optional(),
  externalWindowVerified: z.literal(false).optional(),
  open: z.boolean(),
  focusedItem: z.number().int().nullable(),
  hasLink: z.boolean(),
  hasSelection: z.boolean(),
  clipboardWritten: z.literal(true).optional(),
  navigationRequested: z.literal(true).optional(),
  guestFocusRequested: z.literal(true).optional()
})
export type BrowserContextMenuState = z.infer<typeof BrowserContextMenuState>
