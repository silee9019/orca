import { z } from 'zod'
const target = { promptKey: z.string().min(1).max(256), reviewedTarget: z.uuid() }
export const LinearSkillPromptActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('get') }),
  z.strictObject({ kind: z.literal('dismiss'), ...target }),
  z.strictObject({ kind: z.literal('finish'), ...target })
])
export type LinearSkillPromptAction = z.infer<typeof LinearSkillPromptActionSchema>
