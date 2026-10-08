import { z } from 'zod'
import { MAX_TIMER_DELAY_MS } from '../timer-delay'
import { parseExecutionHostId } from '../execution-host'

const Host = z
  .string()
  .min(1)
  .max(1024)
  .refine((value) => {
    const host = parseExecutionHostId(value)
    return Boolean(host && host.kind !== 'runtime' && host.id === value)
  })
const Pty = z.string().min(1).max(1024)
const Scope = z.object({
  executionHostIds: z
    .array(Host)
    .min(1)
    .max(128)
    .refine((values) => new Set(values).size === values.length),
  ptyIds: z
    .array(Pty)
    .max(128)
    .refine((values) => new Set(values).size === values.length)
    .default([])
})
export const TerminalSpawnWatchRequest = Scope.extend({
  watchMs: z.number().int().min(1).max(MAX_TIMER_DELAY_MS)
}).strict()
export const TerminalSpawnSubscriptionParams = Scope.extend({
  subscriptionId: z.string().uuid()
}).strict()
export type TerminalSpawnSubscriptionParams = z.output<typeof TerminalSpawnSubscriptionParams>
export const TerminalSpawnAnnouncement = z
  .object({
    ptyId: Pty,
    incarnationId: z.string().min(1).max(256).optional(),
    executionHostId: Host,
    awaitsRegistration: z.boolean()
  })
  .strict()
const sequence = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const TerminalSpawnStreamFrame = z.union([
  Scope.extend({ type: z.literal('ready'), sequence: z.literal(0) }).strict(),
  z
    .object({ type: z.literal('event'), sequence, announcement: TerminalSpawnAnnouncement })
    .strict(),
  z.object({ type: z.literal('end'), sequence }).strict(),
  z.object({ type: z.literal('error'), code: z.literal('terminal_spawn_unavailable') }).strict()
])
