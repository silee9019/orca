import type { Store } from './persistence'
import type { Repo } from '../shared/repo-types'
import { getRepoExecutionHostId, type ExecutionHostId } from '../shared/execution-host'

export function getRepoForExecutionHost(
  store: Store,
  repoId: string,
  hostId?: ExecutionHostId
): Repo | null {
  if (!hostId) {
    return store.getRepo(repoId) ?? null
  }
  // Repo IDs can repeat across execution hosts.
  return (
    store
      .getRepos()
      .find((repo) => repo.id === repoId && getRepoExecutionHostId(repo) === hostId) ?? null
  )
}
