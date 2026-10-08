import { z } from 'zod'
export const WorkspaceSpaceScanStart = z
  .object({ expectedExecutionHostId: z.literal('local') })
  .strict()
export const WorkspaceSpaceScanRequest = WorkspaceSpaceScanStart.extend({
  requestId: z.string().uuid()
}).strict()
export const WorkspaceSpaceScanResult = WorkspaceSpaceScanRequest.extend({
  repoOffset: z.number().int().min(0).max(1000000).default(0),
  worktreeOffset: z.number().int().min(0).max(1000000).default(0),
  limit: z.number().int().min(1).max(500).default(100)
}).strict()
