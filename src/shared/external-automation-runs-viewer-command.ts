import { z } from 'zod'

export const ExternalAutomationRunsViewerActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('get') }),
  z.strictObject({
    kind: z.literal('page'),
    direction: z.enum(['next', 'previous']),
    reviewedTarget: z.uuid()
  }),
  z.strictObject({
    kind: z.literal('select'),
    runId: z.string().min(1).max(8192),
    reviewedTarget: z.uuid()
  })
])
export type ExternalAutomationRunsViewerAction = z.infer<
  typeof ExternalAutomationRunsViewerActionSchema
>
