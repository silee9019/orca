import { z } from 'zod'

export const IssueCommandRunnerParams = z
  .object({
    worktree: z.string().trim().min(1),
    command: z.string().min(1),
    confirm: z.literal(true)
  })
  .strict()
