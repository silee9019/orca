import { z } from 'zod'
import { ResourceViewerActionSchema } from '../resource-manager-command'

export const ResourceManagerViewerParams = z
  .object({ viewer: z.literal('desktop'), action: ResourceViewerActionSchema })
  .strict()
