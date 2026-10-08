import { z } from 'zod'
import { RepoSelector } from './gitlab-params'

export const GitLabIssueLookup = RepoSelector.extend({ number: z.number().int().positive() })
export const GitLabMergeRequestLookup = RepoSelector.extend({ iid: z.number().int().positive() })
export const GitLabBranchMergeRequestLookup = RepoSelector.extend({
  branch: z.string(),
  linkedMRIid: z.number().int().positive().nullish()
})
