import { z } from 'zod'
export const CliFileWatchStart = z.object({ worktree: z.string().trim().min(1).max(4096) }).strict()
export const CliFileWatchRequest = z.object({ requestId: z.string().uuid() }).strict()
export const CliFileWatchStatus = CliFileWatchRequest.extend({
  afterSequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0)
}).strict()
