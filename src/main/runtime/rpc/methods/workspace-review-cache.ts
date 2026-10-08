import { defineMethod } from '../core'
import { WorkspaceReviewCacheReadParams } from '../../../../shared/rpc-contract/workspace-review-cache-params'

export const WORKSPACE_REVIEW_CACHE_METHODS = [
  defineMethod({
    name: 'cache.getGitHub',
    params: WorkspaceReviewCacheReadParams,
    handler: (_params, { runtime }) => ({ cache: runtime.readWorkspaceGitHubCache() })
  })
]
