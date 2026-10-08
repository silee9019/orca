import { z } from 'zod'
import { openEnum } from './zod-salvage'
import type { WorkspaceListViewerCommand } from './rpc-contract/workspace-list-viewer-params'

export const WorkspaceListViewerSnapshotSchema = z
  .object({
    groupBy: z.string(),
    sortBy: z.string(),
    projectOrderBy: z.string(),
    collapsedGroups: z.array(z.string()),
    runtimeContextKey: z.string(),
    empty: z.boolean(),
    rows: z.array(
      z
        .object({
          type: z.string(),
          key: z.string(),
          hostId: z.string().nullable(),
          workspaceId: z.string().nullable().optional()
        })
        .strip()
    )
  })
  .strip()
export type WorkspaceListViewerSnapshot = z.infer<typeof WorkspaceListViewerSnapshotSchema>
export const WorkspaceListViewerResultSchema = z
  .object({
    viewer: z.literal('host'),
    viewerId: z.number().int(),
    dispatched: z.boolean(),
    applied: z.boolean(),
    persisted: z.boolean().nullable(),
    writeOutcome: openEnum(['accepted', 'rejected', 'unknown', 'not_requested'], 'unknown'),
    metadataPersisted: z.boolean().nullable(),
    groupBy: z.string(),
    sortBy: z.string(),
    projectOrderBy: z.string(),
    collapsedGroups: z.array(z.string()),
    rendered: WorkspaceListViewerSnapshotSchema.nullable(),
    reason: openEnum(
      [
        'viewer_runtime_changed',
        'viewer_surface_superseded',
        'persistence_failed',
        'persistence_unverifiable',
        'persistence_superseded',
        'workspace_list_unavailable',
        'viewer_not_applied'
      ],
      'viewer_not_applied'
    ).optional()
  })
  .strip()
export type WorkspaceListViewerResult = z.infer<typeof WorkspaceListViewerResultSchema>
export type WorkspaceListViewerRequest = {
  id: string
  expiresAt: number
  command: WorkspaceListViewerCommand
}
export type WorkspaceListViewerResponse =
  | { id: string; ok: true; result: WorkspaceListViewerResult }
  | { id: string; ok: false; error: string }
