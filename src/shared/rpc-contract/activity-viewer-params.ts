import { z } from 'zod'
import { ActivityOriginKindSchema } from '../activity-viewer-scope'
import { UiUpdateFields } from './client-ui-params'

export const ActivityViewerSurfaceSchema = z.enum(['sidebar-agents', 'activity-page'])
export type ActivityViewerSurface = z.infer<typeof ActivityViewerSurfaceSchema>
const target = { viewer: z.literal('host'), surface: ActivityViewerSurfaceSchema }
export const ActivityViewerParams = z.discriminatedUnion('operation', [
  z.object({ ...target, operation: z.literal('get') }).strict(),
  z.object({ ...target, operation: z.literal('mark-all-read') }).strict(),
  z.object({ ...target, operation: z.literal('read-toggle'), paneKey: z.string().min(1) }).strict(),
  z
    .object({
      ...target,
      operation: z.literal('read-toggle-many'),
      paneKeys: z
        .array(z.string().min(1))
        .min(2)
        .refine((keys) => new Set(keys).size === keys.length)
    })
    .strict(),
  z
    .object({
      ...target,
      operation: z.literal('origin'),
      kind: ActivityOriginKindSchema,
      hidden: z.boolean()
    })
    .strict(),
  z.object({ ...target, operation: z.literal('scope-reset') }).strict(),
  z
    .object({ ...target, operation: z.literal('host-toggle'), host: z.string().trim().min(1) })
    .strict(),
  z.object({ ...target, operation: z.literal('hosts-toggle-all') }).strict(),
  z
    .object({
      ...target,
      operation: z.literal('group'),
      by: UiUpdateFields.shape.agentsGroupBy.unwrap()
    })
    .strict(),
  z
    .object({
      ...target,
      operation: z.literal('read'),
      filter: UiUpdateFields.shape.agentsReadFilter.unwrap()
    })
    .strict(),
  z.object({ ...target, operation: z.literal('compact'), enabled: z.boolean() }).strict(),
  z.object({ ...target, operation: z.literal('children'), enabled: z.boolean() }).strict(),
  z.object({ ...target, operation: z.literal('search'), query: z.string() }).strict(),
  z
    .object({
      ...target,
      surface: z.literal('activity-page'),
      operation: z.literal('search-clear')
    })
    .strict(),
  z
    .object({
      ...target,
      surface: z.literal('sidebar-agents'),
      operation: z.literal('search-visible'),
      enabled: z.boolean()
    })
    .strict()
])
export type ActivityViewerCommand = z.infer<typeof ActivityViewerParams>
