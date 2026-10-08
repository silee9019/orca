import { z } from 'zod'
export const DesktopWorkItemNotify = z
  .object({
    expectedExecutionHostId: z.literal('local'),
    expectedRepoHostId: z.string().trim().min(1).max(1000),
    repoId: z.string().trim().min(1).max(1000),
    type: z.enum(['issue', 'pr']),
    number: z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
  })
  .strict()
