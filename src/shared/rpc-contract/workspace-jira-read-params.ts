import { z } from 'zod'
import { SearchIssues } from './jira-params'

export const JiraCliSearchStart = SearchIssues.extend({
  jql: z.string().trim().min(1).max(16_384),
  limit: z.number().int().min(1).max(100).optional()
}).strict()
export const JiraCliSummaryStart = z
  .object({
    key: z.string().trim().min(1).max(256),
    siteId: z.string().trim().min(1).max(256)
  })
  .strict()
export const JiraCliReadRequest = z.object({ requestId: z.string().uuid() }).strict()
