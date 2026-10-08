import { AutomationWorkspacePickerActionSchema } from './automation-workspace-picker-command'
import { z } from 'zod'

export const AutomationWorkspaceViewerActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('base-branch'),
    reviewedTarget: z.uuid(),
    value: z.string().max(2048)
  }),
  z.strictObject({
    kind: z.literal('picker-form'),
    reviewedTarget: z.uuid(),
    action: AutomationWorkspacePickerActionSchema
  }),
  z.object({ kind: z.literal('get') }).strict(),
  z
    .object({
      kind: z.literal('mode'),
      reviewedTarget: z.uuid(),
      value: z.enum(['existing', 'new_per_run'])
    })
    .strict(),
  z
    .object({
      kind: z.literal('select'),
      reviewedTarget: z.uuid(),
      workspaceId: z.string().min(1).max(4096)
    })
    .strict()
])
export type AutomationWorkspaceViewerAction = z.infer<typeof AutomationWorkspaceViewerActionSchema>
