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
const WorkspaceBoardWorkspaceSchema = z
  .object({ id: z.string(), repoId: z.string(), statusId: z.string(), hostId: z.string() })
  .strip()
export type WorkspaceBoardWorkspace = z.infer<typeof WorkspaceBoardWorkspaceSchema>
export const WorkspaceBoardSnapshotSchema = z
  .object({
    runtimeContextKey: z.string(),
    open: z.boolean(),
    columnWidth: z.number(),
    statuses: z.array(WorkspaceBoardStatusSchema),
    // Why: a host that predates assignment publishes neither field.
    workspaces: z.array(WorkspaceBoardWorkspaceSchema).optional(),
    taskStatusSyncEnabled: z.boolean().optional()
  })
  .strip()
export type WorkspaceBoardSnapshot = z.infer<typeof WorkspaceBoardSnapshotSchema>
const WorkspaceBoardAssignmentSchema = z
  .object({
    statusId: z.string(),
    workspaces: z.array(
      z
        .object({
          workspaceId: z.string(),
          hostId: z.string(),
          changed: z.boolean(),
          // Why: only a local host is read back; an unknown future outcome must not read as confirmed.
          hostWrite: openEnum(
            ['confirmed', 'unverifiable', 'not_confirmed', 'not_requested'],
            'unverifiable'
          )
        })
        .strip()
    ),
    // Why: the sync runs after the move and its outcome is not awaited; an unknown value must not read as "no sync".
    taskStatusSync: openEnum(['not_requested', 'requested'], 'requested'),
    // Why: the store's batch update logs a failed host write and reverts instead of rejecting.
    writeFailureReporting: openEnum(['swallowed_by_store'], 'swallowed_by_store')
  })
  .strip()
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
    assignment: WorkspaceBoardAssignmentSchema.optional(),
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
