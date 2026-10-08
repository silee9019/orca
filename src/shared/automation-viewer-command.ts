import { z } from 'zod'
import type { TuiAgent } from './tui-agent'
import { isTuiAgent } from './tui-agent-config'
import { isAutomationListSearchQueryTooLarge } from './automation-list-search-query'
import { AutomationEditorViewerActionSchema } from './automation-editor-viewer-command'

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
  z.object({ kind: z.literal('get') }).strict(),
  z.object({ kind: z.literal('editor-form'), action: AutomationEditorViewerActionSchema }).strict(),
  z.object({ kind: z.literal('editor-create') }).strict(),
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
