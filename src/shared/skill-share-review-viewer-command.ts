import { z } from 'zod'

export const SkillShareReviewViewerActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('get') }).strict(),
  z
    .object({ kind: z.literal('description'), reviewedTarget: z.uuid(), expanded: z.boolean() })
    .strict(),
  z.object({ kind: z.literal('files'), reviewedTarget: z.uuid(), open: z.boolean() }).strict(),
  z.object({ kind: z.literal('skills'), reviewedTarget: z.uuid(), open: z.boolean() }).strict()
])
export type SkillShareReviewViewerAction = z.infer<typeof SkillShareReviewViewerActionSchema>
