import { z } from 'zod'
import { isSkillInstallProviderId, type SkillInstallProviderId } from './skill-install-providers'

const reviewedTarget = z.uuid()
export const SkillInstallAgentViewerActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('get') }).strict(),
  z.object({ kind: z.literal('open'), reviewedTarget, value: z.boolean() }).strict(),
  z
    .object({
      kind: z.literal('provider'),
      reviewedTarget,
      provider: z.custom<SkillInstallProviderId>(
        (value) => typeof value === 'string' && isSkillInstallProviderId(value)
      ),
      checked: z.boolean()
    })
    .strict(),
  z.object({ kind: z.literal('select-all'), reviewedTarget, checked: z.boolean() }).strict()
])
export type SkillInstallAgentViewerAction = z.infer<typeof SkillInstallAgentViewerActionSchema>
