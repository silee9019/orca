import { z } from 'zod'

const viewer = z.literal('host')
export const ProjectFilterParams = z.discriminatedUnion('operation', [
  z.object({ viewer, operation: z.literal('get') }).strict(),
  z.object({ viewer, operation: z.literal('clear') }).strict(),
  z
    .object({
      viewer,
      operation: z.literal('set'),
      repoIds: z.array(z.string().min(1).max(1024)).min(1).max(1000)
    })
    .strict()
])
export type ProjectFilterOperation = z.infer<typeof ProjectFilterParams>
