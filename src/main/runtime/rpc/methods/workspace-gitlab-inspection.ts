import { defineMethod } from '../core'
import { RepoSelector } from '../../../../shared/rpc-contract/gitlab-params'
import {
  GitLabIssueLookup,
  GitLabMergeRequestLookup,
  GitLabBranchMergeRequestLookup
} from '../../../../shared/rpc-contract/workspace-gitlab-inspection-params'

export const WORKSPACE_GITLAB_INSPECTION_METHODS = [
  defineMethod({
    name: 'gitlab.viewer',
    params: null,
    handler: (_params, { runtime }) => runtime.getGitLabViewer()
  }),
  defineMethod({
    name: 'gitlab.issue',
    params: GitLabIssueLookup,
    handler: (params, { runtime }) => runtime.getGitLabRepoIssue(params.repo, params.number)
  }),
  defineMethod({
    name: 'gitlab.mr',
    params: GitLabMergeRequestLookup,
    handler: (params, { runtime }) => runtime.getGitLabRepoMergeRequest(params.repo, params.iid)
  }),
  defineMethod({
    name: 'gitlab.mrForBranch',
    params: GitLabBranchMergeRequestLookup,
    handler: (params, { runtime }) =>
      runtime.getGitLabRepoMergeRequestForBranch(params.repo, params.branch, params.linkedMRIid)
  }),
  defineMethod({
    name: 'gitlab.projectSlug',
    params: RepoSelector,
    handler: (params, { runtime }) => runtime.getGitLabRepoProjectSlug(params.repo)
  }),
  defineMethod({
    name: 'gitlab.listAssignableUsers',
    params: RepoSelector,
    handler: (params, { runtime }) => runtime.listGitLabRepoAssignableUsers(params.repo)
  })
]
