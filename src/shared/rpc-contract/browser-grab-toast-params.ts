import { z } from 'zod'
import { BrowserOverlayFocusCommand } from './browser-overlay-focus-params'
export const BrowserGrabToastTarget = BrowserOverlayFocusCommand.extend({ page: z.string().min(1) })
export const BrowserGrabToastCommand = z.intersection(
  BrowserGrabToastTarget,
  z.discriminatedUnion('action', [
    z.object({ action: z.literal('status') }),
    z.object({ action: z.literal('copy'), toastId: z.string().min(1).max(160) })
  ])
)
export type BrowserGrabToastCommand = z.infer<typeof BrowserGrabToastCommand>
export const BrowserGrabToastState = BrowserGrabToastTarget.extend({
  toastId: z.string().min(1),
  hasScreenshot: z.literal(true),
  copied: z.boolean()
})
export type BrowserGrabToastState = z.infer<typeof BrowserGrabToastState>
