import { z } from 'zod'

export const AutomationRunPageViewerActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('get') }),
  z.strictObject({
    kind: z.enum(['back', 'open-workspace', 'rerun']),
    reviewedTarget: z.uuid()
  })
])
export type AutomationRunPageViewerAction = z.infer<typeof AutomationRunPageViewerActionSchema>
