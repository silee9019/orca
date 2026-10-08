import { z } from 'zod'
export const OrchestrationCommandDialogActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('get') }),
  z.strictObject({ kind: z.literal('set-open'), open: z.boolean(), reviewedTarget: z.uuid() })
])
export type OrchestrationCommandDialogAction = z.infer<
  typeof OrchestrationCommandDialogActionSchema
>
