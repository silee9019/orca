import { z } from 'zod'
import { openEnum } from './zod-salvage'
import type { StatusBarViewerCommand } from './rpc-contract/status-bar-viewer-params'

export const StatusBarViewerSnapshotSchema = z
  .object({
    items: z.array(z.string()),
    percentageDisplay: z.string(),
    providers: z.array(z.string()),
    meters: z
      .array(z.object({ provider: z.string(), display: z.string(), value: z.number() }).strip())
      .default([]),
    compact: z.boolean(),
    runtimeContextKey: z.string()
  })
  .strip()
export type StatusBarViewerSnapshot = z.infer<typeof StatusBarViewerSnapshotSchema>
export const StatusBarViewerResultSchema = z
  .object({
    viewer: z.literal('host'),
    viewerId: z.number().int(),
    dispatched: z.boolean(),
    applied: z.boolean(),
    persisted: z.boolean().nullable(),
    visible: z.boolean(),
    items: z.array(z.string()),
    availableItems: z.array(z.string()),
    percentageDisplay: z.string(),
    percentageNoticeDismissed: z.boolean(),
    interactionRecorded: z.boolean().nullable(),
    writes: z
      .object({
        preference: openEnum(['not_requested', 'accepted', 'rejected'], 'rejected'),
        interaction: openEnum(['not_requested', 'accepted', 'rejected'], 'rejected')
      })
      .strip(),
    rendered: StatusBarViewerSnapshotSchema.nullable(),
    reason: openEnum(
      [
        'viewer_runtime_changed',
        'viewer_surface_superseded',
        'persistence_superseded',
        'viewer_not_applied',
        'persistence_failed',
        'persistence_unverifiable',
        'status_bar_meter_unavailable'
      ],
      'viewer_not_applied'
    ).optional()
  })
  .strip()
export type StatusBarViewerResult = z.infer<typeof StatusBarViewerResultSchema>
export type StatusBarViewerRequest = {
  id: string
  expiresAt: number
  command: StatusBarViewerCommand
}
export type StatusBarViewerResponse =
  | { id: string; ok: true; result: StatusBarViewerResult }
  | { id: string; ok: false; error: string }
