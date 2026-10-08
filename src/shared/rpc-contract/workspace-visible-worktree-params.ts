import { z } from 'zod'
import { ExecutionHostId } from './automation-params'

export const DesktopVisibleWorktrees = z
  .object({
    repoId: z.string().min(1),
    executionHostId: ExecutionHostId
  })
  .strict()
