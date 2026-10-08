import { z } from 'zod'

export const AutomationRowViewerActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('get') }).strict(),
  z
    .object({
      kind: z.enum(['run', 'toggle']),
      reviewedTarget: z.uuid(),
      rowKey: z.string().min(1).max(4096)
    })
    .strict()
])
export type AutomationRowViewerAction = z.infer<typeof AutomationRowViewerActionSchema>
