import { z } from 'zod'

const SkillId = z.string().min(1).max(8192)
export const SkillListViewerActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('get') }).strict(),
  z.object({ kind: z.literal('detail'), id: SkillId.nullable() }).strict(),
  z
    .object({
      kind: z.literal('detail-action'),
      action: z.enum(['close', 'copy-path', 'reveal', 'share', 'delete'])
    })
    .strict(),
  z
    .object({ kind: z.literal('focus'), value: z.enum(['next', 'previous', 'first', 'last']) })
    .strict(),
  z.object({ kind: z.literal('focus-id'), id: SkillId }).strict(),
  z.object({ kind: z.literal('activate'), id: SkillId, range: z.boolean() }).strict(),
  z
    .object({ kind: z.literal('select'), id: SkillId, selected: z.boolean(), range: z.boolean() })
    .strict(),
  z.object({ kind: z.literal('share'), id: SkillId }).strict(),
  z.object({ kind: z.literal('copy-path'), id: SkillId }).strict(),
  z.object({ kind: z.literal('reveal'), id: SkillId }).strict(),
  z.object({ kind: z.literal('delete'), id: SkillId }).strict()
])
export type SkillListViewerAction = z.infer<typeof SkillListViewerActionSchema>
