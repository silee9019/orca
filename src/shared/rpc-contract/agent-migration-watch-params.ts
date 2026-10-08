import { z } from 'zod'
import { MAX_TIMER_DELAY_MS } from '../timer-delay'

const ptyIds = z
  .array(z.string().min(1).max(512))
  .min(1)
  .max(128)
  .refine((values) => new Set(values).size === values.length)
const scope = z.object({ ptyIds })
export const AgentMigrationWatchRequest = scope
  .extend({ watchMs: z.number().int().min(1).max(MAX_TIMER_DELAY_MS) })
  .strict()
export const AgentMigrationSubscriptionParams = scope
  .extend({ subscriptionId: z.string().uuid() })
  .strict()
export type AgentMigrationSubscriptionParams = z.output<typeof AgentMigrationSubscriptionParams>
const sequence = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const change = z.union([
  z
    .object({
      type: z.literal('set'),
      entry: z
        .object({
          ptyId: z.string().min(1).max(512),
          worktreeId: z.string().optional(),
          tabId: z.string().optional(),
          leafId: z.string().optional(),
          paneKey: z.string().optional(),
          reason: z.literal('legacy-numeric-pane-key'),
          source: z.enum(['local', 'ssh']),
          updatedAt: z.number().finite().nonnegative()
        })
        .strict()
    })
    .strict(),
  z.object({ type: z.literal('clear'), ptyId: z.string().min(1).max(512) }).strict()
])
export const AgentMigrationStreamFrame = z.union([
  scope.extend({ type: z.literal('ready'), sequence: z.literal(0) }).strict(),
  z.object({ type: z.literal('event'), sequence, change }).strict(),
  z.object({ type: z.literal('end'), sequence }).strict(),
  z.object({ type: z.literal('error'), code: z.literal('agent_migration_unavailable') }).strict()
])
