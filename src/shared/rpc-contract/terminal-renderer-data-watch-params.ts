import { z } from 'zod'
import { MAX_TIMER_DELAY_MS } from '../timer-delay'
import { TerminalControlSubscriptionParams } from './terminal-control-watch-params'
const Target = TerminalControlSubscriptionParams.omit({ subscriptionId: true })
  .extend({ includeContent: z.literal(true) })
  .strict()
export const TerminalRendererDataWatchRequest = Target.extend({
  watchMs: z.number().int().min(1).max(MAX_TIMER_DELAY_MS)
}).strict()
export const TerminalRendererDataSubscriptionParams = Target.extend({
  subscriptionId: z.string().uuid()
}).strict()
export type TerminalRendererDataSubscriptionParams = z.output<
  typeof TerminalRendererDataSubscriptionParams
>
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const TerminalRendererDataSignal = z
  .object({
    kind: z.literal('renderer-data'),
    ptyId: z.string().min(1).max(1024),
    rendererId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    origin: z.enum(['pty-output', 'synthetic-title']),
    payload: z
      .object({
        id: z.string().min(1).max(1024),
        data: z.string().max(2 * 1024 * 1024),
        seq: count.optional(),
        rawLength: count.optional(),
        transformed: z.boolean().optional(),
        background: z.boolean().optional(),
        droppedOutput: z.boolean().optional()
      })
      .strict()
  })
  .strict()
  .refine((request) => request.payload.id === request.ptyId)
export type TerminalRendererDataSignal = z.output<typeof TerminalRendererDataSignal>
export const TerminalRendererDataStreamFrame = z.union([
  Target.extend({ type: z.literal('ready'), sequence: z.literal(0) }).strict(),
  z
    .object({
      type: z.literal('event'),
      sequence: count,
      request: TerminalRendererDataSignal,
      rendererApplied: z.literal(false)
    })
    .strict(),
  z.object({ type: z.literal('end'), sequence: count }).strict(),
  z
    .object({
      type: z.literal('error'),
      code: z.literal('terminal_control_owner_changed_or_cancelled')
    })
    .strict()
])
