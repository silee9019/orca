import { z } from 'zod'
import { StatusBarItem, UiUpdateFields } from './client-ui-params'

const viewer = z.literal('host')
export const StatusBarViewerParams = z.discriminatedUnion('operation', [
  z.object({ viewer, operation: z.literal('get') }).strict(),
  z.object({ viewer, operation: z.literal('toggle') }).strict(),
  z
    .object({ viewer, operation: z.literal('item'), item: StatusBarItem, enabled: z.boolean() })
    .strict(),
  z
    .object({
      viewer,
      operation: z.literal('percentage'),
      display: UiUpdateFields.shape.usagePercentageDisplay.unwrap()
    })
    .strict()
])
export type StatusBarViewerCommand = z.infer<typeof StatusBarViewerParams>
