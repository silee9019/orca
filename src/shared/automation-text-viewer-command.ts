import { z } from 'zod'
export const AutomationTextViewerActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('get') }),
  z.strictObject({ kind: z.literal('focus-name'), reviewedTarget: z.uuid() })
])
export type AutomationTextViewerAction = z.infer<typeof AutomationTextViewerActionSchema>
