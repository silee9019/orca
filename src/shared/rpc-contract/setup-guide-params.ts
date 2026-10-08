import { z } from 'zod'
export const SetupGuideParams = z
  .object({ viewer: z.literal('host'), operation: z.literal('open') })
  .strict()
export type SetupGuideCommand = z.infer<typeof SetupGuideParams>
