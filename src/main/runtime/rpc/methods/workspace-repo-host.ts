import { defineMethod } from '../core'
import {
  RepoHostRemoval,
  RepoHostReorder
} from '../../../../shared/rpc-contract/workspace-repo-host-params'

export const WORKSPACE_REPO_HOST_METHODS = [
  defineMethod({
    name: 'repo.defaultProjectParent',
    params: null,
    handler: (_params, { runtime }) => runtime.getDefaultCreateProjectParent()
  }),
  defineMethod({
    name: 'repo.removeForHost',
    params: RepoHostRemoval,
    handler: (params, { runtime }) => runtime.removeProjectForHost(params.repoId, params.hostId)
  }),
  defineMethod({
    name: 'repo.reorderForHost',
    params: RepoHostReorder,
    handler: (params, { runtime }) => runtime.reorderReposForHost(params.orderedIds, params.hostId)
  })
]
