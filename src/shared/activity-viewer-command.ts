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
    groups: z
      .array(
        z
          .object({
            key: z.string(),
            collapsed: z.boolean(),
            threadCount: z.number().int().nonnegative()
          })
          .strip()
      )
      .optional(),
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
    issueMenuAction: z
      .object({ paneKey: z.string(), enabled: z.boolean(), visible: z.boolean().nullable() })
      .strip()
      .optional(),
    editAction: z
      .object({
        paneKey: z.string(),
        field: openEnum(['issue', 'comment', 'unknown'], 'unknown'),
        opened: z.boolean(),
        focus: openEnum(['focused', 'disabled', 'unverified', 'unknown'], 'unknown')
      })
      .strip()
      .optional(),
    previewAction: z
      .object({ paneKey: z.string(), enabled: z.boolean(), visible: z.boolean().nullable() })
      .strip()
      .optional(),
    copyAction: z
      .object({
        paneKey: z.string(),
        kind: openEnum(['title', 'path', 'unknown'], 'unknown'),
        writeAcknowledged: z.boolean(),
        verified: z.boolean()
      })
      .strip()
      .optional(),
    scrollAction: z
      .object({
        requestedTop: z.number(),
        targetTop: z.number(),
        scrollTop: z.number().nullable(),
        clientHeight: z.number().nullable(),
        scrollHeight: z.number().nullable(),
        visibleRowKeys: z.array(z.string())
      })
      .strip()
      .optional(),
    resizeAction: z
      .object({
        requestedWidth: z.number(),
        targetWidth: z.number(),
        renderedWidth: z.number().nullable()
      })
      .strip()
      .optional(),
    pageAction: z
      .object({ requestedView: z.string(), reachedView: z.string().nullable() })
      .strip()
      .optional(),
    groupAction: z
      .object({
        key: z.string(),
        requestedCollapsed: z.boolean(),
        currentCollapsed: z.boolean().nullable()
      })
      .strip()
      .optional(),
    navigationAction: z
      .object({
        operation: openEnum(['jump', 'select', 'unknown'], 'unknown'),
        paneKey: z.string(),
        workspaceId: z.string(),
        executionHostId: z.string(),
        requestAccepted: z.boolean().nullable(),
        requestOutcome: openEnum(
          [
            'workspace-unavailable',
            'workspace-only',
            'structured-requested',
            'terminal-focus-requested',
            'unknown'
          ],
          'unknown'
        ).optional(),
        contentState: openEnum(
          ['ready', 'empty', 'loading', 'error', 'unknown'],
          'unknown'
        ).optional(),
        reached: openEnum(
          ['none', 'workspace', 'terminal-pane', 'structured-tab', 'unknown'],
          'unknown'
        ),
        remoteAck: openEnum(['unknown', 'accepted', 'rejected'], 'unknown')
      })
      .strip()
      .optional(),
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
