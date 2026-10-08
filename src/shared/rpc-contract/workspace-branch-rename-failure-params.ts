import { z } from 'zod'
export const BranchRenameFailureRead = z
  .object({
    expectedExecutionHostId: z.literal('local'),
    worktreeId: z.string().min(1).max(4096)
  })
  .strict()
