import { z } from 'zod'
import { isFeatureTipId, type FeatureTipId } from '../feature-tips'

const viewer = z.literal('host')
const tipId = z.custom<FeatureTipId>(isFeatureTipId)

export const FeatureTipViewerParams = z.discriminatedUnion('operation', [
  z.object({ viewer, operation: z.literal('get') }).strict(),
  z.object({ viewer, operation: z.literal('skip'), tipId: tipId.optional() }).strict()
])
export type FeatureTipViewerCommand = z.infer<typeof FeatureTipViewerParams>
