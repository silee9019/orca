import { WorkspaceAutomationViewerActionSchema } from './workspace-automation-viewer-command'
import { ExternalAutomationRunsViewerActionSchema } from './external-automation-runs-viewer-command'
import { AutomationRunPageViewerActionSchema } from './automation-run-page-viewer-command'
import { AutomationRowViewerActionSchema } from './automation-row-viewer-command'
import { AutomationRunsViewerActionSchema } from './automation-runs-viewer-command'
import { z } from 'zod'
import type { TuiAgent } from './tui-agent'
import { isTuiAgent } from './tui-agent-config'
import { isAutomationListSearchQueryTooLarge } from './automation-list-search-query'
import { AutomationEditorViewerActionSchema } from './automation-editor-viewer-command'
import { AutomationDeleteViewerActionSchema } from './automation-delete-viewer-command'

export const AutomationViewerFilterSchema = z
  .object({
    status: z.enum(['all', 'enabled', 'paused']),
    lastRun: z.enum(['all', 'failed', 'succeeded', 'never']),
    agentIds: z.array(z.custom<TuiAgent>(isTuiAgent)).max(128),
    hostStableKeys: z.array(z.string().min(1).max(2048)).max(128).optional()
  })
  .strict()
const sortField = z.enum(['name', 'lastRun'])
export const AutomationViewerActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('workspace-provenance-form'),
    action: WorkspaceAutomationViewerActionSchema
  }),
  z.strictObject({
    kind: z.literal('content-disclosure'),
    expanded: z.boolean(),
    reviewedTarget: z.uuid()
  }),
  z.strictObject({ kind: z.literal('owner-notice-dismiss'), reviewedTarget: z.uuid() }),
  z.strictObject({
    kind: z.literal('owner-notice-recover'),
    action: z.enum(['retry', 'reconnect', 'update-server']),
    reviewedTarget: z.uuid()
  }),
  z.strictObject({
    kind: z.literal('history-recover'),
    action: z.enum(['retry', 'reconnect', 'update-server']),
    reviewedTarget: z.uuid()
  }),
  z.strictObject({
    kind: z.literal('history-open'),
    runId: z.string().min(1).max(8192),
    reviewedTarget: z.uuid()
  }),
  z.strictObject({
    kind: z.literal('external-runs-form'),
    tableKey: z.string().min(1).max(8192),
    action: ExternalAutomationRunsViewerActionSchema
  }),
  z.strictObject({ kind: z.literal('run-page-form'), action: AutomationRunPageViewerActionSchema }),
  z.object({ kind: z.literal('get') }).strict(),
  z.object({ kind: z.literal('refresh') }).strict(),
  z
    .object({
      kind: z.literal('editor-save'),
      reviewedTarget: z.string().uuid(),
      reviewedDraft: z.string().uuid()
    })
    .strict(),
  z
    .object({
      kind: z.literal('runs-open'),
      entryKey: z.string().min(1).max(8192),
      reviewedTarget: z.string().uuid()
    })
    .strict(),
  z
    .object({
      kind: z.literal('host-recover'),
      stableKey: z.string().min(1).max(2048),
      reviewedOwner: z.string().min(1).max(8192),
      action: z.enum(['retry', 'reconnect', 'update-server'])
    })
    .strict(),
  z
    .object({ kind: z.literal('host-select'), stableKey: z.string().min(1).max(2048).nullable() })
    .strict(),
  z.object({ kind: z.literal('row-form'), action: AutomationRowViewerActionSchema }).strict(),
  z.object({ kind: z.literal('runs-form'), action: AutomationRunsViewerActionSchema }).strict(),
  z.object({ kind: z.literal('delete-form'), action: AutomationDeleteViewerActionSchema }).strict(),
  z.object({ kind: z.literal('editor-form'), action: AutomationEditorViewerActionSchema }).strict(),
  z
    .object({ kind: z.literal('editor-create'), templateId: z.string().min(1).max(256).optional() })
    .strict(),
  z
    .object({
      kind: z.literal('editor-edit'),
      source: z.enum(['local', 'external']),
      rowKey: z.string().min(1).max(4096)
    })
    .strict(),
  z
    .object({
      kind: z.literal('list-navigation'),
      action: z.enum(['next', 'previous', 'activate'])
    })
    .strict(),
  z
    .object({ kind: z.literal('navigate'), value: z.enum(['list', 'runs', 'detail-runs']) })
    .strict(),
  z
    .object({
      kind: z.literal('query'),
      value: z.string().refine((value) => !isAutomationListSearchQueryTooLarge(value))
    })
    .strict(),
  z.object({ kind: z.literal('filter'), value: AutomationViewerFilterSchema }).strict(),
  z.object({ kind: z.literal('filter-clear') }).strict(),
  z
    .object({
      kind: z.literal('sort'),
      value: z
        .object({ field: sortField, direction: z.enum(['asc', 'desc']) })
        .strict()
        .nullable()
    })
    .strict(),
  z.object({ kind: z.literal('sort-next'), field: sortField }).strict(),
  z
    .object({
      kind: z.literal('select'),
      rowKey: z.string().min(1).max(4096),
      source: z.enum(['local', 'external'])
    })
    .strict(),
  z.object({ kind: z.literal('detail'), open: z.boolean() }).strict(),
  z.object({ kind: z.literal('tab'), value: z.enum(['overview', 'runs']) }).strict(),
  z.object({ kind: z.literal('view'), value: z.enum(['automations', 'runs']) }).strict()
])
export type AutomationViewerAction = z.infer<typeof AutomationViewerActionSchema>
export const AutomationViewerParams = z
  .object({ viewer: z.literal('desktop'), action: AutomationViewerActionSchema })
  .strict()
