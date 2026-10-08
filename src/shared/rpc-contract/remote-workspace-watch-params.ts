import { z } from 'zod'
import { MAX_TIMER_DELAY_MS } from '../timer-delay'

const targetIds = z
  .array(z.string().trim().min(1))
  .min(1)
  .max(128)
  .refine((ids) => new Set(ids).size === ids.length)
export const RemoteWorkspaceWatchRequest = z
  .object({ targetIds, watchMs: z.number().int().min(1).max(MAX_TIMER_DELAY_MS) })
  .strict()
export const RemoteWorkspaceSubscriptionParams = z
  .object({ targetIds, subscriptionId: z.string().uuid() })
  .strict()
export type RemoteWorkspaceSubscriptionParams = z.output<typeof RemoteWorkspaceSubscriptionParams>
const sequence = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const session = z
  .object({
    activeWorktreePath: z.string().nullable(),
    activeTabId: z.string().nullable(),
    tabsByWorktreePath: z.record(z.string(), z.unknown()),
    terminalLayoutsByTabId: z.record(z.string(), z.unknown())
  })
  .passthrough()
export const RemoteWorkspaceStreamFrame = z.union([
  z.object({ type: z.literal('ready'), sequence: z.literal(0), targetIds }).strict(),
  z
    .object({
      type: z.literal('event'),
      sequence,
      change: z
        .object({
          targetId: z.string().min(1),
          sourceClientId: z.string().optional(),
          snapshot: z
            .object({
              namespace: z.string().min(1),
              revision: z.number(),
              updatedAt: z.number(),
              schemaVersion: z.number(),
              hostObservationToken: z.string().min(1),
              session
            })
            .passthrough()
        })
        .strict()
    })
    .strict(),
  z.object({ type: z.literal('end'), sequence }).strict(),
  z.object({ type: z.literal('error'), code: z.literal('remote_workspace_unavailable') }).strict()
])
