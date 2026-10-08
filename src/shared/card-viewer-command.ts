import { z } from 'zod'
import { openEnum } from './zod-salvage'
import type { CardViewerCommand } from './rpc-contract/card-viewer-params'

export const CardViewerSnapshotSchema = z
  .object({
    id: z.string(),
    repoId: z.string(),
    hostId: z.string().nullable(),
    compact: z.boolean(),
    newStyle: z.boolean(),
    properties: z.array(z.string()),
    activityMode: z.string(),
    runtimeContextKey: z.string()
  })
  .strip()
export type CardViewerSnapshot = z.infer<typeof CardViewerSnapshotSchema>
export const CardViewerResultSchema = z
  .object({
    viewer: z.literal('host'),
    viewerId: z.number().int(),
    dispatched: z.boolean(),
    applied: z.boolean(),
    persisted: z.boolean().nullable(),
    compact: z.boolean(),
    properties: z.array(z.string()),
    defaulted: z.boolean(),
    activityMode: z.string(),
    rendered: z.array(CardViewerSnapshotSchema),
    reason: openEnum(
      [
        'viewer_runtime_changed',
        'viewer_surface_superseded',
        'card_surface_unavailable',
        'persistence_superseded',
        'viewer_not_applied'
      ],
      'viewer_not_applied'
    ).optional()
  })
  .strip()
export type CardViewerResult = z.infer<typeof CardViewerResultSchema>
export type CardViewerRequest = { id: string; expiresAt: number; command: CardViewerCommand }
export type CardViewerResponse =
  | { id: string; ok: true; result: CardViewerResult }
  | { id: string; ok: false; error: string }
