import { z } from 'zod'
import { DesktopWorktreeInstanceTarget } from './workspace-lineage-params'
const Desktop = z.object({ expectedExecutionHostId: z.literal('local') })
export const DesktopGitStatusStart = Desktop.extend({
  target: DesktopWorktreeInstanceTarget,
  includeIgnored: z.boolean().default(false),
  includeLineStats: z.boolean().default(false),
  reuseLineStats: z.boolean().default(false),
  bypassEffectiveUpstreamNegativeCache: z.boolean().default(false),
  branchLineTotalMergeBase: z
    .string()
    .regex(/^[a-fA-F0-9]{40}(?:[a-fA-F0-9]{24})?$/)
    .optional()
}).strict()
export const DesktopGitStatusRequest = Desktop.extend({ requestId: z.string().uuid() }).strict()
export const DesktopGitStatusResult = DesktopGitStatusRequest.extend({
  offset: z.number().int().nonnegative().default(0),
  limit: z.number().int().min(1).max(500).default(100)
}).strict()
