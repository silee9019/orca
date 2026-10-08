import { z } from 'zod'

export const SkillFreshnessViewerActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('get') }).strict(),
  z.object({ kind: z.literal('open'), value: z.boolean() }).strict(),
  z.object({ kind: z.literal('refresh') }).strict(),
  z
    .object({
      kind: z.literal('update'),
      names: z.array(z.string().min(1).max(256)).min(1).max(512).optional()
    })
    .strict(),
  z.object({ kind: z.literal('retry') }).strict(),
  z.object({ kind: z.literal('stop') }).strict(),
  z.object({ kind: z.literal('copy-command') }).strict()
])
export type SkillFreshnessViewerAction = z.infer<typeof SkillFreshnessViewerActionSchema>
