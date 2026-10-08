import { z } from 'zod'
import { MAX_TIMER_DELAY_MS } from '../timer-delay'
import { TerminalPreviewInputTargetParams } from './terminal-preview-input-params'

const rendererId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const Target = TerminalPreviewInputTargetParams.omit({ confirm: true })
  .extend({ expectedRendererId: rendererId })
  .strict()
export const TerminalControlWatchRequest = Target.extend({
  watchMs: z.number().int().min(1).max(MAX_TIMER_DELAY_MS)
}).strict()
export const TerminalControlSubscriptionParams = Target.extend({
  subscriptionId: z.string().uuid()
}).strict()
export type TerminalControlSubscriptionParams = z.output<typeof TerminalControlSubscriptionParams>
const Signal = z.object({ ptyId: z.string().min(1).max(1024), rendererId })
export const TerminalControlRequestSignal = z.union([
  Signal.extend({ kind: z.literal('clear-buffer') }).strict(),
  Signal.extend({ kind: z.literal('reset-input-modes') }).strict(),
  Signal.extend({
    kind: z.literal('serialize-buffer'),
    requestId: z.string().uuid(),
    opts: z
      .object({
        scrollbackRows: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional()
      })
      .strict()
      .optional()
  }).strict()
])
export type TerminalControlRequestSignal = z.output<typeof TerminalControlRequestSignal>
const sequence = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const TerminalControlStreamFrame = z.union([
  Target.extend({ type: z.literal('ready'), sequence: z.literal(0) }).strict(),
  z
    .object({
      type: z.literal('event'),
      sequence,
      request: TerminalControlRequestSignal,
      rendererApplied: z.literal(false)
    })
    .strict(),
  z.object({ type: z.literal('end'), sequence }).strict(),
  z
    .object({
      type: z.literal('error'),
      code: z.literal('terminal_control_owner_changed_or_cancelled')
    })
    .strict()
])
