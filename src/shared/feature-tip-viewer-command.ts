import { z } from 'zod'
import { openEnum } from './zod-salvage'
import type { FeatureTipViewerCommand } from './rpc-contract/feature-tip-viewer-params'

export const FeatureTipSnapshotSchema = z
  .object({
    runtimeContextKey: z.string(),
    open: z.boolean(),
    tipId: z.string().nullable(),
    action: z.string().nullable()
  })
  .strip()
export type FeatureTipSnapshot = z.infer<typeof FeatureTipSnapshotSchema>
export const FeatureTipViewerResultSchema = z
  .object({
    viewer: z.literal('host'),
    viewerId: z.number().int(),
    dispatched: z.boolean(),
    applied: z.boolean(),
    persisted: z.boolean().nullable(),
    writeOutcome: openEnum(['unknown', 'not_requested'], 'unknown'),
    // The tip the request acted on, or the open tip for a read; null when none is open.
    tipId: z.string().nullable(),
    // Whether a tip dialog is showing now, which may be a different tip than tipId after a skip.
    open: z.boolean(),
    rendered: FeatureTipSnapshotSchema.nullable(),
    reason: openEnum(
      [
        'viewer_runtime_changed',
        'persistence_unverifiable',
        'persistence_superseded',
        'feature_tip_still_open'
      ],
      'feature_tip_still_open'
    ).optional()
  })
  .strip()
export type FeatureTipViewerResult = z.infer<typeof FeatureTipViewerResultSchema>
export type FeatureTipViewerRequest = {
  id: string
  expiresAt: number
  command: FeatureTipViewerCommand
}
export type FeatureTipViewerResponse =
  | { id: string; ok: true; result: FeatureTipViewerResult }
  | { id: string; ok: false; error: string }
