import { z } from 'zod'
import { SkillDiscoveryTargetSchema } from '../skills'
import { canonicalizeSkillUpdateNames } from '../skill-freshness'

export const skillSharePrepareIpcSchema = z
  .object({
    skillIds: z.array(z.string().min(1).max(4096)).min(1).max(512),
    bundleName: z.string().regex(/^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]{0,62}[a-z0-9])?$/),
    target: SkillDiscoveryTargetSchema.optional(),
    packageId: z.string().min(1).max(128).optional()
  })
  .strict()

export const skillSharePublishIpcSchema = z
  .object({
    preparationId: z.string().uuid(),
    releaseNotes: z.string().max(10_000)
  })
  .strict()

export const SkillPreparationIdParams = z.strictObject({ preparationId: z.string().uuid() })
export const SkillUpdateStartParams = z.strictObject({
  names: z
    .array(z.string().min(1).max(4096))
    .min(1)
    .max(512)
    .refine((names) => canonicalizeSkillUpdateNames(names) !== null)
})
