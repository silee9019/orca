import { z } from 'zod'
import { isFeatureWallSetupStepId, type FeatureWallSetupStepId } from '../feature-wall-setup-steps'

export const SetupGuideParams = z.discriminatedUnion('operation', [
  z.object({ viewer: z.literal('host'), operation: z.literal('open') }).strict(),
  z.object({ viewer: z.literal('host'), operation: z.literal('hide-sidebar') }).strict(),
  z.object({ viewer: z.literal('host'), operation: z.literal('hide-sidebar-entry') }).strict(),
  z
    .object({
      viewer: z.literal('host'),
      operation: z.literal('select-step'),
      stepId: z.custom<FeatureWallSetupStepId>(isFeatureWallSetupStepId)
    })
    .strict()
])

export type SetupGuideCommand = z.infer<typeof SetupGuideParams>
