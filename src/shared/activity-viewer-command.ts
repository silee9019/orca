import { z } from 'zod'
import { ActivityViewerScopeSchema } from './activity-viewer-scope'
import { openEnum } from './zod-salvage'
import {
  ActivityViewerSurfaceSchema,
  type ActivityViewerCommand
} from './rpc-contract/activity-viewer-params'

export const ActivityViewerSnapshotSchema = z
  .object({
    surface: ActivityViewerSurfaceSchema,
    runtimeContextKey: z.string(),
    groupBy: z.string(),
    readFilter: z.string(),
    compact: z.boolean(),
    showChildAgents: z.boolean(),
    querySettled: z.boolean(),
    query: z.string().optional(),
    scope: ActivityViewerScopeSchema.optional(),
    densityMeasured: z.boolean(),
    selectedPaneKey: z.string().nullable(),
    hasUnreadThreads: z.boolean().optional(),
    logicalRows: z.array(
      z
        .object({
          key: z.string(),
          kind: z.string(),
          hostId: z.string().nullable(),
          workspaceId: z.string().nullable()
        })
        .strip()
    ),
    renderedRows: z.array(
      z.object({ key: z.string(), height: z.number().finite().positive() }).strip()
    )
  })
  .strip()
export type ActivityViewerSnapshot = z.infer<typeof ActivityViewerSnapshotSchema>
export const ActivityViewerResultSchema = z
  .object({
    viewer: z.literal('host'),
    viewerId: z.number().int(),
    surface: ActivityViewerSurfaceSchema,
    dispatched: z.boolean(),
    applied: z.boolean(),
    persisted: z.boolean().nullable(),
    persistedScope: ActivityViewerScopeSchema.nullable().optional(),
    completedAction: z
      .object({ paneKeys: z.array(z.string()), remainingPaneKeys: z.array(z.string()) })
      .strip()
      .optional(),
    readAction: z
      .object({
        operation: openEnum(['read', 'unread', 'unknown'], 'unknown'),
        paneKeys: z.array(z.string())
      })
      .strip()
      .optional(),
    readStates: z
      .array(z.object({ paneKey: z.string(), unread: z.boolean().nullable() }).strip())
      .optional(),
    writeOutcome: openEnum(['accepted', 'rejected', 'unknown', 'not_requested'], 'unknown'),
    groupBy: z.string(),
    readFilter: z.string(),
    compact: z.boolean(),
    showChildAgents: z.boolean(),
    rendered: ActivityViewerSnapshotSchema.nullable(),
    reason: openEnum(
      [
        'viewer_runtime_changed',
        'viewer_surface_superseded',
        'persistence_failed',
        'persistence_unverifiable',
        'persistence_superseded',
        'activity_surface_unavailable',
        'activity_rows_unavailable',
        'viewer_not_applied'
      ],
      'viewer_not_applied'
    ).optional()
  })
  .strip()
  .refine(
    (result) => result.rendered === null || result.rendered.surface === result.surface,
    'Activity surface mismatch'
  )
export type ActivityViewerResult = z.infer<typeof ActivityViewerResultSchema>
export type ActivityViewerRequest = {
  id: string
  expiresAt: number
  command: ActivityViewerCommand
}
export type ActivityViewerResponse =
  | { id: string; ok: true; result: ActivityViewerResult }
  | { id: string; ok: false; error: string }
