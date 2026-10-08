import { z } from 'zod'
export const SkillsSharedViewerParams = z
  .object({ viewerId: z.number().int().positive(), operation: z.literal('skills.shared-open') })
  .strict()
export const SkillsSharedViewerResultSchema = z
  .object({
    viewerId: z.number().int().positive(),
    applied: z.boolean(),
    persisted: z.null(),
    state: z.object({ activeView: z.literal('skills'), sharedViewApplied: z.boolean() }).strict()
  })
  .strict()
export type SkillsSharedViewerResult = z.infer<typeof SkillsSharedViewerResultSchema>
