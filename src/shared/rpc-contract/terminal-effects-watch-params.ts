import { z } from 'zod'
import { MAX_TIMER_DELAY_MS } from '../timer-delay'
import { normalizeAgentStatusPayload } from '../agent-status-types'
import { TerminalPreviewInputTargetParams } from './terminal-preview-input-params'

const Target = TerminalPreviewInputTargetParams.omit({ confirm: true })
  .extend({ includeContent: z.literal(true) })
  .strict()
export const TerminalEffectsWatchRequest = Target.extend({
  watchMs: z.number().int().min(1).max(MAX_TIMER_DELAY_MS)
}).strict()
export const TerminalEffectsSubscriptionParams = Target.extend({
  subscriptionId: z.string().uuid()
}).strict()
export type TerminalEffectsSubscriptionParams = z.output<typeof TerminalEffectsSubscriptionParams>
const text = z.string().max(1024 * 1024)
const empty = <Kind extends string>(kind: Kind) => z.object({ kind: z.literal(kind) }).strict()
const payload = z.unknown().transform((value, context) => {
  const normalized = normalizeAgentStatusPayload(value)
  if (!normalized) {
    context.addIssue({ code: 'custom', message: 'Invalid agent status fact' })
    return z.NEVER
  }
  return normalized
})
export const TerminalEffectsBatch = z
  .object({
    ptyId: z.string().min(1).max(1024),
    seq: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    facts: z
      .array(
        z.union([
          z.object({ kind: z.literal('agent-status'), payload }).strict(),
          z
            .object({
              kind: z.literal('title'),
              normalizedTitle: text,
              rawTitle: text,
              staleWorkingTitleClear: z.boolean().optional()
            })
            .strict(),
          z
            .object({
              kind: z.literal('agent-idle'),
              title: text,
              staleWorkingTitleClear: z.boolean().optional()
            })
            .strict(),
          z
            .object({ kind: z.literal('command-finished'), exitCode: z.number().int().nullable() })
            .strict(),
          z
            .object({
              kind: z.literal('pr-link'),
              link: z
                .object({
                  url: text,
                  number: z.number().int().positive(),
                  slug: z.object({ owner: text, repo: text, host: text.optional() }).strict()
                })
                .strict()
            })
            .strict(),
          z.object({ kind: z.literal('command-code-working'), prompt: text }).strict(),
          z.object({ kind: z.literal('command-code-done'), prompt: text }).strict(),
          empty('bell'),
          empty('agent-working'),
          empty('agent-exited'),
          empty('2031-subscribe'),
          empty('2031-unsubscribe')
        ])
      )
      .min(1)
      .max(4096),
    replay: z.boolean().optional(),
    worktreeId: text.optional(),
    tabId: text.optional(),
    paneKey: text.optional(),
    connectionId: text.nullable().optional()
  })
  .strict()
const sequence = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const TerminalEffectsStreamFrame = z.union([
  Target.extend({ type: z.literal('ready'), sequence: z.literal(0) }).strict(),
  z.object({ type: z.literal('event'), sequence, batch: TerminalEffectsBatch }).strict(),
  z.object({ type: z.literal('end'), sequence }).strict(),
  z.object({ type: z.literal('error'), code: z.literal('terminal_effects_owner_changed') }).strict()
])
