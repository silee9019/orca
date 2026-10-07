import { z } from 'zod'
export const BrowserWebAuthnDialogTarget = z.object({
  requestId: z.string().min(1),
  page: z.string().min(1),
  worktreeId: z.string().min(1),
  environmentId: z.string().min(1).nullable(),
  relyingPartyId: z.string().min(1),
  credentialId: z.string().min(1).max(4096).nullable()
})
export type BrowserWebAuthnDialogTarget = z.infer<typeof BrowserWebAuthnDialogTarget>
export const BrowserWebAuthnDialogState = BrowserWebAuthnDialogTarget.omit({
  credentialId: true
}).extend({
  action: z.enum(['cancel', 'select']),
  accepted: z.literal(true),
  removed: z.literal(true)
})
export type BrowserWebAuthnDialogState = z.infer<typeof BrowserWebAuthnDialogState>
