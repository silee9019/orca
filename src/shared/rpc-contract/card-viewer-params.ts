import { z } from 'zod'
import { UiUpdateFields } from './client-ui-params'

const viewer = z.literal('host')
export const CardViewerParams = z.discriminatedUnion('operation', [
  z.object({ viewer, operation: z.literal('get') }).strict(),
  z.object({ viewer, operation: z.literal('mode'), mode: z.enum(['Default', 'Compact']) }).strict(),
  z
    .object({
      viewer,
      operation: z.literal('activity'),
      mode: UiUpdateFields.shape.agentActivityDisplayMode.unwrap()
    })
    .strict()
])
export type CardViewerCommand = z.infer<typeof CardViewerParams>
