import { z } from 'zod'
export const DesktopGitHubRefresh = z
  .object({
    repoId: z.string().min(1).max(1000),
    branch: z.string().min(1).max(1000),
    expectedRepoHostId: z.string().min(1).max(1000),
    expectedExecutionHostId: z.literal('local')
  })
  .strict()
