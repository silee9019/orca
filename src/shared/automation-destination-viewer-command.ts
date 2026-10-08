import { z } from 'zod'
export const AutomationDestinationViewerActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('get') }),
  z.strictObject({
    kind: z.literal('select'),
    reviewedTarget: z.uuid(),
    stableKey: z.string().min(1).max(2048)
  })
])
export type AutomationDestinationViewerAction = z.infer<
  typeof AutomationDestinationViewerActionSchema
>
