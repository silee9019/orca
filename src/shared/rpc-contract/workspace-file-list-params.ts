import { z } from 'zod'
import { DesktopWorktreeInstanceTarget } from './workspace-lineage-params'
const Host = z.object({ expectedExecutionHostId: z.literal('local') })
export const DesktopFileListStart = Host.extend({
  target: DesktopWorktreeInstanceTarget,
  maxResults: z.number().int().min(1).max(10000).default(1000),
  searchQuery: z.string().max(512).optional(),
  excludePaths: z.array(z.string().min(1).max(4096)).max(256).optional(),
  candidatePaths: z.array(z.string().min(1).max(4096)).max(1000).optional(),
  nameFilter: z.string().max(512).optional(),
  includeIgnored: z.boolean().default(false),
  followSymlinks: z.boolean().default(false)
})
  .strict()
  .refine((value) => !value.nameFilter || value.target.executionHostId === 'local', {
    message: 'Name filtering requires a local workspace.'
  })
  .refine(
    (value) => value.searchQuery === undefined || value.target.executionHostId.startsWith('ssh:'),
    { message: 'Search query ranking requires an SSH workspace.' }
  )
export const DesktopFileListRequest = Host.extend({ requestId: z.string().uuid() }).strict()
export const DesktopFileListResult = DesktopFileListRequest.extend({
  offset: z.number().int().min(0).max(10000).default(0),
  limit: z.number().int().min(1).max(500).default(100)
}).strict()
