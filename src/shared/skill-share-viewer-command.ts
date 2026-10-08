import { z } from 'zod'

export const SkillShareViewerActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('get') }).strict(),
  z.object({ kind: z.literal('release-notes'), value: z.string().max(10_000) }).strict(),
  z.object({ kind: z.literal('publish') }).strict(),
  z.object({ kind: z.literal('cancel') }).strict(),
  z.object({ kind: z.literal('copy-link') }).strict(),
  z.object({ kind: z.literal('manage-links') }).strict(),
  z.object({ kind: z.literal('close') }).strict()
])
export type SkillShareViewerAction = z.infer<typeof SkillShareViewerActionSchema>
