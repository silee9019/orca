import { z } from 'zod'
import type { TuiAgent } from './tui-agent'
import { isTuiAgent } from './tui-agent-config'

const DraftValue = z.string().max(65536)
export const AccountMountedViewerActionSchema = z.discriminatedUnion('type', [
  z
    .object({ type: z.literal('account-switcher-toggle'), provider: z.enum(['claude', 'codex']) })
    .strict(),
  z
    .object({
      type: z.literal('account-switcher-runtime'),
      provider: z.enum(['claude', 'codex']),
      groupKey: z.string().min(1).max(512)
    })
    .strict(),
  z
    .object({
      type: z.literal('account-minimax-draft'),
      field: z.enum(['cookie', 'api-key']),
      value: DraftValue
    })
    .strict(),
  z.object({ type: z.literal('account-opencode-go-draft'), value: DraftValue }).strict(),
  z
    .object({
      type: z.literal('account-opencode-go-commit'),
      operation: z.enum(['save', 'clear']),
      confirm: z.literal(true)
    })
    .strict(),
  z.object({ type: z.literal('account-zcode-plan-draft'), value: DraftValue }).strict(),
  z
    .object({
      type: z.literal('account-bitbucket-draft'),
      field: z.enum(['auth-mode', 'email', 'api-token', 'access-token', 'base-url']),
      value: DraftValue
    })
    .strict(),
  z
    .object({
      type: z.literal('account-agent-env-draft'),
      agent: z.custom<TuiAgent>((value) => typeof value === 'string' && isTuiAgent(value)),
      value: DraftValue
    })
    .strict(),
  z
    .object({
      type: z.literal('account-removal-dialog'),
      provider: z.enum(['claude', 'codex', 'opencode', 'devin']),
      accountId: z.string().min(1).max(128).nullable()
    })
    .strict(),
  z.object({ type: z.literal('account-orca-signout-dialog'), open: z.boolean() }).strict(),
  z.object({ type: z.literal('account-bitbucket-dialog'), open: z.boolean() }).strict(),
  z.object({ type: z.literal('account-bitbucket-outside-dismiss') }).strict(),
  z.object({ type: z.literal('account-onboarding-yolo-draft'), enabled: z.boolean() }).strict()
])
export type AccountMountedViewerAction = z.infer<typeof AccountMountedViewerActionSchema>

export class AccountMountedActionError extends Error {
  constructor(readonly code: 'unavailable' | 'ambiguous' | 'busy' | 'invalid_argument' | 'failed') {
    super(
      {
        unavailable: 'The requested account form is unavailable in this viewer.',
        ambiguous: 'The requested account form is ambiguous in this viewer.',
        busy: 'The requested account form is busy in this viewer.',
        invalid_argument: 'Invalid mounted account action.',
        failed: 'The mounted account action could not be applied.'
      }[code]
    )
  }
}

export function parseAccountMountedViewerAction(input: unknown): AccountMountedViewerAction {
  const parsed = AccountMountedViewerActionSchema.safeParse(input)
  if (!parsed.success) {
    throw new AccountMountedActionError('invalid_argument')
  }
  return parsed.data
}
