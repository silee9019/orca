import { z } from 'zod'
export const BrowserFailureTarget = z.object({
  worktreeId: z.string().min(1),
  placement: z.enum(['local', 'client-hosted']),
  environmentId: z.string().min(1).nullable(),
  expectedUrl: z.string().min(1),
  errorCode: z.number().int(),
  action: z.enum(['copy-address', 'open-external', 'certificate-proceed', 'retry']),
  challengeId: z.string().min(1).optional()
})
export type BrowserFailureTarget = z.infer<typeof BrowserFailureTarget>
export const BrowserFailureState = BrowserFailureTarget.extend({ accepted: z.literal(true) })
export type BrowserFailureState = z.infer<typeof BrowserFailureState>
