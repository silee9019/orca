import { AccountMountedViewerActionSchema } from './account-mounted-viewer-command'
import { z } from 'zod'

const AccountsViewerActionInput = z.discriminatedUnion('type', [
  ...AccountMountedViewerActionSchema.options,
  z.object({ type: z.literal('configure-usage') }).strict(),
  z
    .object({
      type: z.literal('codex-login-link'),
      operation: z.enum(['copy', 'open']),
      confirm: z.literal(true)
    })
    .strict(),
  z.object({ type: z.literal('open-bitbucket-docs'), confirm: z.literal(true) }).strict(),
  z
    .object({
      type: z.literal('open-session-log'),
      workspaceId: z.string().min(1),
      filePath: z.string().trim().min(1),
      executionHostId: z.literal('local')
    })
    .strict(),
  z
    .object({
      type: z.literal('open-settings'),
      pane: z.enum(['accounts', 'orca-account']),
      provider: z
        .enum(['claude', 'codex', 'gemini', 'opencode-go', 'minimax', 'grok', 'cursor', 'zcode'])
        .optional()
    })
    .strict(),
  z
    .object({
      type: z.literal('queue-codex-restarts'),
      ptyIds: z.array(z.string().min(1)).min(1).max(100),
      confirm: z.literal(true)
    })
    .strict()
])

export const AccountsViewerActionSchema = z.unknown().transform((input, context) => {
  const parsed = AccountsViewerActionInput.safeParse(input)
  if (!parsed.success) {
    context.addIssue({ code: 'custom', message: 'Invalid account viewer action' })
    return z.NEVER
  }
  return parsed.data
})
