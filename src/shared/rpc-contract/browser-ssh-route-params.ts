import { z } from 'zod'
import { openEnum } from '../zod-salvage'
const BrowserSshRouteIdentity = z.object({
  worktreeId: z.string().min(1),
  page: z.string().min(1),
  targetId: z.string().min(1),
  profileId: z.string().min(1),
  errorKind: z.enum(['forwarding-blocked', 'ssh-unavailable', 'unknown']).optional(),
  errorCode: z.number().int().optional(),
  expectedUrl: z.string().min(1).optional(),
  action: z.enum(['retry', 'try-without-probe', 'browse-local', 'recheck'])
})
function validTarget(target: z.infer<typeof BrowserSshRouteIdentity>): boolean {
  return target.action === 'recheck'
    ? target.errorCode !== undefined && target.expectedUrl !== undefined
    : target.errorKind !== undefined
}
export const BrowserSshRouteTarget = BrowserSshRouteIdentity.refine(validTarget, {
  message: 'Specify the current routing error, or the exact failed page for recheck.'
})
export type BrowserSshRouteTarget = z.infer<typeof BrowserSshRouteTarget>
export const BrowserSshRouteReceipt = BrowserSshRouteIdentity.extend({
  accepted: z.literal(true),
  attempt: z.number().int().nonnegative(),
  routeState: openEnum(['preparing', 'ready', 'error', 'unrouted'], 'error')
}).refine(validTarget)
export type BrowserSshRouteReceipt = z.infer<typeof BrowserSshRouteReceipt>
