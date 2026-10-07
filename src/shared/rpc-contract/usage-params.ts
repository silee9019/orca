import { z } from 'zod'
import { CodexResetTarget } from './accounts-params'

export const UsageProvider = z.enum(['claude', 'codex', 'opencode', 'muse'])
export const UsageProviderParams = z.object({ provider: UsageProvider }).strict()
export const UsageEnabledParams = UsageProviderParams.extend({ enabled: z.boolean() })
export const UsageRefreshParams = UsageProviderParams.extend({ force: z.boolean().default(false) })
export const UsageQueryParams = UsageProviderParams.extend({
  scope: z.enum(['orca', 'all']),
  range: z.enum(['7d', '30d', '90d', 'all'])
})
export const UsageSessionsParams = UsageQueryParams.extend({
  limit: z.number().int().positive().max(1000).optional()
})
export const UsageBreakdownParams = UsageQueryParams.extend({ kind: z.enum(['model', 'project']) })
export const RateLimitTargetParams = z.object({ target: CodexResetTarget }).strict()
export const RateLimitPollingParams = z.object({ ms: z.number().int().positive() }).strict()

export const UsageViewerFilterParams = UsageQueryParams.partial({
  scope: true,
  range: true
}).refine(
  ({ scope, range }) => scope !== undefined || range !== undefined,
  'At least one usage filter is required'
)

export const NativeContextViewerTarget = z
  .object({ kind: z.enum(['session', 'pty']), id: z.string().min(1) })
  .strict()

export const UsageTabSchema = z.enum(['overview', 'claude', 'codex', 'opencode', 'muse', 'grok'])

export const UsageSignInReceiptSchema = z
  .object({
    accepted: z.literal(true),
    provider: z.enum(['claude', 'codex']),
    operationId: z.string().uuid(),
    status: z.enum(['pending', 'completed', 'failed', 'unavailable']),
    cancelRequested: z.boolean()
  })
  .strict()

export const UsageViewerActionSchema = z.discriminatedUnion('action', [
  z
    .object({ action: z.literal('refresh-account-usage'), provider: z.enum(['cursor', 'zcode']) })
    .strict(),
  z
    .object({
      action: z.literal('roster-signin'),
      provider: z.enum([
        'claude',
        'codex',
        'gemini',
        'opencode-go',
        'kimi',
        'minimax',
        'grok',
        'antigravity',
        'cursor',
        'zcode'
      ])
    })
    .strict(),
  z
    .object({
      action: z.literal('inline-signin'),
      accountId: z.string().min(1),
      target: CodexResetTarget
    })
    .strict(),
  z.object({ action: z.literal('inline-signin-status'), operationId: z.string().uuid() }).strict(),
  z.object({ action: z.literal('inline-signin-cancel'), operationId: z.string().uuid() }).strict(),
  z
    .object({ action: z.literal('feature-wall-signin'), provider: z.enum(['claude', 'codex']) })
    .strict(),
  z
    .object({
      action: z.literal('feature-wall-signin-status'),
      provider: z.enum(['claude', 'codex']),
      operationId: z.string().uuid()
    })
    .strict(),
  z
    .object({
      action: z.literal('feature-wall-signin-cancel'),
      provider: z.enum(['claude', 'codex']),
      operationId: z.string().uuid()
    })
    .strict(),
  z.object({ action: z.literal('refresh-account-state') }).strict(),
  z.object({ action: z.literal('open-percentage-settings') }).strict(),
  z
    .object({ action: z.literal('set-enabled'), provider: UsageProvider, enabled: z.boolean() })
    .strict(),
  z
    .object({
      action: z.literal('refresh-provider'),
      provider: UsageProvider.or(z.literal('overview'))
    })
    .strict(),
  z.object({ action: z.literal('record-interaction') }).strict(),
  z
    .object({
      action: z.literal('skill-example'),
      skillCommand: z.string().min(1),
      exampleId: z.string().min(1),
      operation: z.enum(['open', 'close', 'copy'])
    })
    .strict(),
  z
    .object({
      action: z.literal('set-context-open'),
      target: NativeContextViewerTarget,
      open: z.boolean()
    })
    .strict(),
  z
    .object({
      action: z.literal('dismiss-notice'),
      notice: z.enum(['empty-usage', 'percentage-display'])
    })
    .strict(),
  z
    .object({
      action: z.literal('set-menu-open'),
      open: z.boolean(),
      focusPolicy: z.enum(['restore-trigger', 'retain-current']).optional()
    })
    .strict()
    .refine(
      (value) => !value.open || value.focusPolicy === undefined,
      'Focus policy applies only when closing the menu'
    ),
  z
    .object({
      action: z.literal('share'),
      provider: z.enum(['claude', 'codex']),
      operation: z.enum(['open', 'copy', 'x'])
    })
    .strict(),
  z.object({ action: z.literal('select-tab'), tab: UsageTabSchema }).strict(),
  z
    .object({
      action: z.literal('set-filters'),
      provider: UsageProvider,
      scope: z.enum(['orca', 'all']).optional(),
      range: z.enum(['7d', '30d', '90d', 'all']).optional()
    })
    .strict()
    .refine(
      ({ scope, range }) => scope !== undefined || range !== undefined,
      'At least one usage filter is required'
    ),
  z
    .object({
      action: z.literal('set-display-mode'),
      mode: z.enum(['verbose', 'compact'])
    })
    .strict()
])

export const UsageViewerParams = z
  .object({
    viewer: z.literal('desktop'),
    action: UsageViewerActionSchema
  })
  .strict()
