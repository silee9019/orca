import { z } from 'zod'
import { BrowserOverlayFocusCommand } from './browser-overlay-focus-params'
import { BrowserClientPageTarget } from './browser-client-page-target'
export const BrowserServerReopenCommand = BrowserOverlayFocusCommand.extend({
  page: z.string().min(1),
  environmentId: z.string().min(1),
  clientTarget: BrowserClientPageTarget
})
export type BrowserServerReopenCommand = z.infer<typeof BrowserServerReopenCommand>
export const BrowserServerReopenState = BrowserServerReopenCommand.omit({
  clientTarget: true
}).extend({ created: z.literal(true), createdRemotePageId: z.string().min(1) })
export type BrowserServerReopenState = z.infer<typeof BrowserServerReopenState>
