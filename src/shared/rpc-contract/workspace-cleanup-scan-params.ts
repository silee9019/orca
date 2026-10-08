import { z } from 'zod'
import { WORKSPACE_CLEANUP_TARGET_BATCH_LIMIT } from '../workspace-cleanup'
export const DesktopCleanupScanStart = z
  .object({
    expectedExecutionHostId: z.literal('local'),
    worktreeId: z.string().min(1).max(8192).optional(),
    worktreeIds: z
      .array(z.string().min(1).max(8192))
      .max(WORKSPACE_CLEANUP_TARGET_BATCH_LIMIT)
      .optional(),
    skipGitWorktreeIds: z.array(z.string().min(1).max(8192)).max(10000).optional(),
    includeAllWorkspaces: z.boolean().optional(),
    refreshActivity: z.boolean().optional()
  })
  .strict()
export const DesktopCleanupScanRequest = z
  .object({ expectedExecutionHostId: z.literal('local'), requestId: z.string().uuid() })
  .strict()
