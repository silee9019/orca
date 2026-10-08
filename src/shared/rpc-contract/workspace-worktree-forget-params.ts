import { z } from 'zod'
import { ExecutionHostId } from './automation-params'
import { splitWorktreeId } from '../worktree/id'
export const DesktopWorktreeForget = z
  .object({
    worktreeId: z
      .string()
      .min(1)
      .max(8192)
      .refine((value) => {
        const parsed = splitWorktreeId(value)
        return Boolean(parsed?.repoId && parsed.worktreePath)
      }, 'Use a full worktree ID.'),
    hostId: ExecutionHostId,
    expectedExecutionHostId: z.literal('local')
  })
  .strict()
