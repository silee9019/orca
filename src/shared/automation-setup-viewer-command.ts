import { z } from 'zod'

export const AutomationSetupViewerActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('get') }).strict(),
  z.object({ kind: z.literal('open'), reviewedTarget: z.uuid(), value: z.boolean() }).strict(),
  z
    .object({
      kind: z.literal('decision'),
      reviewedTarget: z.uuid(),
      value: z.enum(['run', 'skip'])
    })
    .strict()
])
export type AutomationSetupViewerAction = z.infer<typeof AutomationSetupViewerActionSchema>
