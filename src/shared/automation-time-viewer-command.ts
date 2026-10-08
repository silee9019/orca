import { z } from 'zod'

const digit = { reviewedTarget: z.uuid(), field: z.enum(['hour', 'minute']) }
export const AutomationTimeViewerActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('get') }).strict(),
  z.object({ kind: z.literal('input'), ...digit, value: z.string().max(128) }).strict(),
  z
    .object({ kind: z.literal('step'), ...digit, delta: z.union([z.literal(1), z.literal(-1)]) })
    .strict(),
  z.object({ kind: z.literal('commit'), ...digit }).strict(),
  z.object({ kind: z.literal('period'), reviewedTarget: z.uuid() }).strict()
])
export type AutomationTimeViewerAction = z.infer<typeof AutomationTimeViewerActionSchema>
