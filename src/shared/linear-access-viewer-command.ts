import { z } from 'zod'
export const LinearAccessViewerActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('get') }),
  z.strictObject({
    kind: z.enum([
      'open-task-sources',
      'manage-access',
      'open-integrations',
      'close-access-dialog'
    ]),
    paneKey: z.string().min(1).max(256),
    reviewedTarget: z.uuid()
  })
])
export type LinearAccessViewerAction = z.infer<typeof LinearAccessViewerActionSchema>
