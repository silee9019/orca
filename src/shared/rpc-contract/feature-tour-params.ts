import { z } from 'zod'
export const FeatureTourParams = z
  .object({ viewer: z.literal('host'), operation: z.literal('open') })
  .strict()
export type FeatureTourCommand = z.infer<typeof FeatureTourParams>
