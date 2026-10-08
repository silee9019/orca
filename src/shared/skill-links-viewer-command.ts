import { z } from 'zod'

const id = z.string().min(1).max(8192)
export const SkillLinksViewerActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('get') }).strict(),
  z.object({ kind: z.literal('contents'), id, open: z.boolean() }).strict(),
  z.object({ kind: z.literal('copy'), id }).strict(),
  z
    .object({ kind: z.literal('confirm'), id, value: z.enum(['revoke', 'delete']).nullable() })
    .strict(),
  z.object({ kind: z.literal('execute'), id, operation: z.enum(['revoke', 'delete']) }).strict()
])
export type SkillLinksViewerAction = z.infer<typeof SkillLinksViewerActionSchema>
