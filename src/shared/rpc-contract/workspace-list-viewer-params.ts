import { z } from 'zod'
import { UiUpdateFields } from './client-ui-params'
const viewer = z.literal('host')
export const WorkspaceListViewerParams = z.discriminatedUnion('operation', [
  z.object({ viewer, operation: z.literal('get') }).strict(),
  z
    .object({ viewer, operation: z.literal('group'), by: UiUpdateFields.shape.groupBy.unwrap() })
    .strict(),
  z
    .object({ viewer, operation: z.literal('sort'), by: UiUpdateFields.shape.sortBy.unwrap() })
    .strict(),
  z
    .object({
      viewer,
      operation: z.literal('project-order'),
      by: UiUpdateFields.shape.projectOrderBy.unwrap()
    })
    .strict(),
  z.object({ viewer, operation: z.literal('group-toggle'), groupKey: z.string().min(1) }).strict()
])
export type WorkspaceListViewerCommand = z.infer<typeof WorkspaceListViewerParams>
