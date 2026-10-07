import { openEnum } from '../zod-salvage'
import { z } from 'zod'
export const BrowserSshRouteTarget = z.object({
  worktreeId: z.string().min(1),
  page: z.string().min(1),
  targetId: z.string().min(1),
  profileId: z.string().min(1),
  errorKind: z.enum(['forwarding-blocked', 'ssh-unavailable', 'unknown']),
  action: z.enum(['retry', 'try-without-probe', 'browse-local'])
})
export type BrowserSshRouteTarget = z.infer<typeof BrowserSshRouteTarget>
export const BrowserSshRouteReceipt = BrowserSshRouteTarget.extend({
  accepted: z.literal(true),
  attempt: z.number().int().nonnegative(),
  routeState: openEnum(['preparing', 'ready', 'error', 'unrouted'], 'error')
})
export type BrowserSshRouteReceipt = z.infer<typeof BrowserSshRouteReceipt>
