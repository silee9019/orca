import { z } from 'zod'
export const AutomationWorkspacePickerActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('get') }),
  z.strictObject({ kind: z.literal('open'), reviewedTarget: z.uuid(), value: z.boolean() }),
  z.strictObject({ kind: z.literal('focus'), reviewedTarget: z.uuid() }),
  z.strictObject({
    kind: z.literal('select'),
    reviewedTarget: z.uuid(),
    workspaceId: z.string().min(1).max(4096)
  })
])
export type AutomationWorkspacePickerAction = z.infer<typeof AutomationWorkspacePickerActionSchema>
