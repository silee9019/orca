import {
  includesQualifiedSearchRefs,
  projectRepoSearchRefsForClient
} from './repo-search-ref-projection'
import { defineMethod } from '../core'
import {
  RepoHostRefSearch,
  RepoHostRemoval,
  RepoHostReorder
} from '../../../../shared/rpc-contract/workspace-repo-host-params'

export const WORKSPACE_REPO_HOST_METHODS = [
  defineMethod({
    name: 'repo.searchRefsForHost',
    params: RepoHostRefSearch,
    handler: async (params, { runtime, clientCapabilities }) =>
      projectRepoSearchRefsForClient(
        await runtime.searchRepoRefsForHost(
          params,
          includesQualifiedSearchRefs(clientCapabilities)
        ),
        clientCapabilities
      )
  }),
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
