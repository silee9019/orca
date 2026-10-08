import { z } from 'zod'
import { DEFAULT_SEARCH_MAX_RESULTS } from '../text-search'
import { FileSearch } from './files-params'
import { DesktopWorktreeInstanceTarget } from './workspace-lineage-params'
const Host = z.object({ expectedExecutionHostId: z.literal('local') })
export const DesktopFileSearchStart = FileSearch.omit({ worktree: true })
  .extend({
    expectedExecutionHostId: z.literal('local'),
    target: DesktopWorktreeInstanceTarget,
    query: z.string().min(1).max(4096),
    includePattern: z.string().max(4096).optional(),
    excludePattern: z.string().max(4096).optional(),
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(DEFAULT_SEARCH_MAX_RESULTS)
      .default(DEFAULT_SEARCH_MAX_RESULTS)
  })
  .strict()
export const DesktopFileSearchRequest = Host.extend({ requestId: z.string().uuid() }).strict()
export const DesktopFileSearchResult = DesktopFileSearchRequest.extend({
  offset: z.number().int().min(0).max(DEFAULT_SEARCH_MAX_RESULTS).default(0),
  limit: z.number().int().min(1).max(500).default(100)
}).strict()
