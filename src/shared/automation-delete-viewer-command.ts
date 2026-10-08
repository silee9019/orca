import { z } from 'zod'

export const AutomationDeleteViewerActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('get') }).strict(),
  z
    .object({
      kind: z.literal('request'),
      source: z.enum(['local', 'external']),
      rowKey: z.string().min(1).max(4096)
    })
    .strict(),
  z.object({ kind: z.literal('cancel'), reviewedTarget: z.uuid() }).strict(),
  z.object({ kind: z.literal('dismiss'), reviewedTarget: z.uuid() }).strict(),
  z.object({ kind: z.literal('focus'), reviewedTarget: z.uuid() }).strict(),
  z
    .object({ kind: z.literal('dont-ask-again'), reviewedTarget: z.uuid(), value: z.boolean() })
    .strict(),
  z.object({ kind: z.literal('confirm'), reviewedTarget: z.uuid() }).strict()
])
export type AutomationDeleteViewerAction = z.infer<typeof AutomationDeleteViewerActionSchema>
