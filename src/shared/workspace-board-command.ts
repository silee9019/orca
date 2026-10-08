import { z } from 'zod'
import { openEnum } from './zod-salvage'
import type { WorkspaceBoardCommand } from './rpc-contract/workspace-board-params'

const WorkspaceBoardStatusSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    color: z.string().optional(),
    icon: z.string().optional()
  })
  .strip()
export const WorkspaceBoardSnapshotSchema = z
  .object({
    runtimeContextKey: z.string(),
    open: z.boolean(),
    columnWidth: z.number(),
    statuses: z.array(WorkspaceBoardStatusSchema)
  })
  .strip()
export type WorkspaceBoardSnapshot = z.infer<typeof WorkspaceBoardSnapshotSchema>
export const WorkspaceBoardResultSchema = z
  .object({
    viewer: z.literal('host'),
    viewerId: z.number().int(),
    dispatched: z.boolean(),
    applied: z.boolean(),
    persisted: z.boolean().nullable(),
    writeOutcome: openEnum(['unknown', 'not_requested'], 'unknown'),
    reassignment: openEnum(['unknown', 'not_requested'], 'unknown'),
    statuses: z.array(WorkspaceBoardStatusSchema),
    columnWidth: z.number(),
    rendered: WorkspaceBoardSnapshotSchema.nullable(),
    reason: openEnum(
      [
        'viewer_runtime_changed',
        'viewer_surface_superseded',
        'persistence_unverifiable',
        'persistence_superseded',
        'workspace_board_unavailable',
        'viewer_not_applied'
      ],
      'viewer_not_applied'
    ).optional()
  })
  .strip()
export type WorkspaceBoardResult = z.infer<typeof WorkspaceBoardResultSchema>
export type WorkspaceBoardRequest = {
  id: string
  expiresAt: number
  command: WorkspaceBoardCommand
}
export type WorkspaceBoardResponse =
  | { id: string; ok: true; result: WorkspaceBoardResult }
  | { id: string; ok: false; error: string }
