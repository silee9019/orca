import { z } from 'zod'

export const SkillShareIdParams = z.strictObject({ shareId: z.string().min(1).max(128) })
export const SkillPackageIdParams = z.strictObject({ packageId: z.string().min(1).max(128) })
export const SkillPackageVersionParams = SkillPackageIdParams.extend({
  versionId: z.string().min(1).max(128)
})
