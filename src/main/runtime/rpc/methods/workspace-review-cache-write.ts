import { defineMethod } from '../core'
import { WorkspaceGitHubCacheWriteParams } from '../../../../shared/rpc-contract/workspace-github-cache'

export const WORKSPACE_REVIEW_CACHE_WRITE_METHODS = [
  defineMethod({
    name: 'cache.setGitHub',
    params: WorkspaceGitHubCacheWriteParams,
    handler: (params, { runtime }) =>
      runtime.applyWorkspaceGitHubCache(params.expected, params.next)
  })
]
