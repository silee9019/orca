import { z } from 'zod'
import { BrowserWebAuthnDialogTarget } from './browser-webauthn-dialog-params'
export const BrowserWebAuthnFocusTarget = BrowserWebAuthnDialogTarget.omit({
  credentialId: true
}).extend({ accountId: z.string().min(1).max(4096) })
export type BrowserWebAuthnFocusTarget = z.infer<typeof BrowserWebAuthnFocusTarget>
export const BrowserWebAuthnFocusState = BrowserWebAuthnFocusTarget.omit({
  accountId: true
}).extend({ focused: z.literal(true), accountIndex: z.literal(0) })
export type BrowserWebAuthnFocusState = z.infer<typeof BrowserWebAuthnFocusState>
