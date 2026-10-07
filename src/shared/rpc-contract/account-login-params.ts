import { z } from 'zod'
import { CodexSelectionTarget } from './accounts-params'

export const AccountLoginProviderParams = z
  .object({ provider: z.enum(['claude', 'codex']) })
  .strict()
export const AccountLoginStartParams = AccountLoginProviderParams.extend({
  accountId: z.string().trim().min(1).optional(),
  target: CodexSelectionTarget.optional()
})
export type AccountLoginOperation = z.infer<typeof AccountLoginProviderParams> &
  (
    | { action: 'status' }
    | { action: 'cancel' }
    | (z.infer<typeof AccountLoginStartParams> & { action: 'start' })
  )
export type AccountLoginStatus = {
  status: 'idle' | 'pending' | 'completed' | 'cancelled' | 'failed'
  browserAuthorizationPending?: boolean
}
