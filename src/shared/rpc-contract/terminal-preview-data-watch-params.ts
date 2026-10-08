import { z } from 'zod'
import {
  TerminalRendererDataWatchRequest,
  TerminalRendererDataSubscriptionParams
} from './terminal-renderer-data-watch-params'
export const TerminalPreviewDataWatchRequest = TerminalRendererDataWatchRequest
export const TerminalPreviewDataSubscriptionParams = TerminalRendererDataSubscriptionParams
export type TerminalPreviewDataSubscriptionParams = z.output<
  typeof TerminalPreviewDataSubscriptionParams
>
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  ptyId = z.string().min(1).max(1024)
export const TerminalPreviewDataSignal = z
  .object({
    kind: z.literal('preview-data'),
    ptyId,
    rendererId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    payload: z.discriminatedUnion('type', [
      z
        .object({
          type: z.literal('data'),
          ptyId,
          data: z.string().max(2 * 1024 * 1024),
          bytes: z
            .number()
            .int()
            .positive()
            .max(8 * 1024 * 1024)
        })
        .strict(),
      z.object({ type: z.literal('resync'), ptyId }).strict()
    ])
  })
  .strict()
  .refine(
    (request) =>
      request.payload.ptyId === request.ptyId &&
      (request.payload.type === 'resync' ||
        new TextEncoder().encode(request.payload.data).byteLength === request.payload.bytes)
  )
export type TerminalPreviewDataSignal = z.output<typeof TerminalPreviewDataSignal>
export const TerminalPreviewDataStreamFrame = z.union([
  TerminalPreviewDataSubscriptionParams.omit({ subscriptionId: true })
    .extend({ type: z.literal('ready'), sequence: z.literal(0) })
    .strict(),
  z
    .object({
      type: z.literal('event'),
      sequence: count,
      request: TerminalPreviewDataSignal,
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
