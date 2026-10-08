import { z } from 'zod'
import { TerminalPresentationWatchRequest } from './terminal-presentation-watch-params'

export const TerminalExitWatchRequest = TerminalPresentationWatchRequest
export const TerminalExitSubscriptionParams = TerminalExitWatchRequest.omit({ watchMs: true })
  .extend({ subscriptionId: z.string().uuid() })
  .strict()
export type TerminalExitSubscriptionParams = z.output<typeof TerminalExitSubscriptionParams>
const Target = TerminalExitWatchRequest.omit({ watchMs: true })
const Cause = z.union([
  z.object({ kind: z.literal('operator_close') }).strict(),
  z.object({ kind: z.literal('signaled'), signal: z.number().int() }).strict(),
  z.object({ kind: z.literal('exited'), exitCode: z.number().int() }).strict(),
  z
    .object({
      kind: z.literal('unknown'),
      reason: z.enum(['stop_unverified', 'host_status_unavailable', 'cause_unreported'])
    })
    .strict()
])
export const TerminalExitObservation = z
  .object({
    ptyId: z.string().min(1).max(1024),
    incarnationId: z.string().min(1).max(256),
    executionHostId: z.string().min(1).max(1024),
    code: z.number().int(),
    cause: Cause.optional(),
    verdict: z.union([
      z.object({ status: z.literal('exited') }).strict(),
      z
        .object({ status: z.literal('live'), ptyIds: z.array(z.string().min(1).max(1024)).max(1) })
        .strict(),
      z.object({ status: z.literal('unverifiable'), reason: z.string().max(4096) }).strict()
    ])
  })
  .strict()
const sequence = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const TerminalExitStreamFrame = z.union([
  Target.extend({ type: z.literal('ready'), sequence: z.literal(0) }).strict(),
  z.object({ type: z.literal('event'), sequence, observation: TerminalExitObservation }).strict(),
  z.object({ type: z.literal('end'), sequence }).strict(),
  z
    .object({
      type: z.literal('error'),
      code: z.literal('terminal_exit_owner_changed_or_unverifiable')
    })
    .strict()
])
