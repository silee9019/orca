import { z } from 'zod'
import { isAutomationListSearchQueryTooLarge } from './automation-list-search-query'

const hostKey = z.string().min(1).max(2048)
export const AutomationRunsViewerActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('get') }).strict(),
  z.object({ kind: z.literal('refresh'), reviewedTarget: z.string().uuid() }).strict(),
  z.object({ kind: z.literal('load-more'), reviewedTarget: z.string().uuid() }).strict(),
  z
    .object({
      kind: z.literal('query'),
      value: z.string().refine((value) => !isAutomationListSearchQueryTooLarge(value))
    })
    .strict(),
  z
    .object({
      kind: z.literal('status'),
      value: z.enum(['all', 'successful', 'failed', 'active', 'skipped'])
    })
    .strict(),
  z
    .object({
      kind: z.literal('hosts'),
      values: z
        .array(hostKey)
        .max(128)
        .refine((values) => new Set(values).size === values.length)
    })
    .strict(),
  z.object({ kind: z.literal('host-toggle'), value: hostKey }).strict(),
  z.object({ kind: z.literal('hosts-clear') }).strict()
])
export type AutomationRunsViewerAction = z.infer<typeof AutomationRunsViewerActionSchema>
