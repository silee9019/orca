import { BrowserClientNavigationUrl } from './browser-client-navigation-params'
import { redactKagiSessionToken } from '../browser-url'
import { z } from 'zod'
import { BrowserOverlayFocusCommand } from './browser-overlay-focus-params'
export const BrowserToolbarExternalCommand = BrowserOverlayFocusCommand.extend({
  page: z.string().min(1),
  url: BrowserClientNavigationUrl.max(32768).refine((url) => redactKagiSessionToken(url) === url)
})
export type BrowserToolbarExternalCommand = z.infer<typeof BrowserToolbarExternalCommand>
export const BrowserToolbarExternalState = BrowserToolbarExternalCommand.extend({
  requested: z.literal(true),
  externalWindowVerified: z.literal(false)
})
export type BrowserToolbarExternalState = z.infer<typeof BrowserToolbarExternalState>
export const BrowserToolbarExternalViewerCommand = z.object({
  viewer: z.literal('host'),
  operation: z.literal('toolbar-external'),
  command: BrowserToolbarExternalCommand
})
