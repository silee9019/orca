import { z } from 'zod'
import { ExecutionHostId } from './automation-params'
import { RepoSearchRefs } from './repo-params'
import { requiredString } from './rpc-param-primitives'

export const RepoHostRemoval = z.object({
  hostId: ExecutionHostId,
  repoId: requiredString('Missing repo ID')
})

export const RepoHostReorder = z.object({
  hostId: ExecutionHostId,
  orderedIds: z.array(requiredString('Missing repo ID'))
})

export const RepoHostRefSearch = RepoSearchRefs.omit({ repo: true }).extend({
  hostId: ExecutionHostId,
  repoId: requiredString('Missing repo ID')
})

export type RepoHostRefSearchArgs = z.infer<typeof RepoHostRefSearch>
