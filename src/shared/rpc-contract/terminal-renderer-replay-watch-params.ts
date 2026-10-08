import { z } from 'zod'
import {
  TerminalRendererDataWatchRequest,
  TerminalRendererDataSubscriptionParams
} from './terminal-renderer-data-watch-params'
export const TerminalRendererReplayWatchRequest = TerminalRendererDataWatchRequest
export const TerminalRendererReplaySubscriptionParams = TerminalRendererDataSubscriptionParams
export type TerminalRendererReplaySubscriptionParams = z.output<
  typeof TerminalRendererReplaySubscriptionParams
>
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const TerminalRendererReplaySignal = z
  .object({
    kind: z.literal('renderer-replay'),
    ptyId: z.string().min(1).max(1024),
    rendererId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    origin: z.enum(['provider-replay', 'reattach-replay']),
    payload: z
      .object({ id: z.string().min(1).max(1024), data: z.string().max(2 * 1024 * 1024) })
      .strict()
  })
  .strict()
  .refine((request) => request.payload.id === request.ptyId)
export type TerminalRendererReplaySignal = z.output<typeof TerminalRendererReplaySignal>
export const TerminalRendererReplayStreamFrame = z.union([
  TerminalRendererReplaySubscriptionParams.omit({ subscriptionId: true })
    .extend({ type: z.literal('ready'), sequence: z.literal(0) })
    .strict(),
  z
    .object({
      type: z.literal('event'),
      sequence: count,
      request: TerminalRendererReplaySignal,
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
