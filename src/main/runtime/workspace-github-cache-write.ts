import { isDeepStrictEqual } from 'node:util'
import type { PersistedState } from '../../shared/persisted-state-types'
import type { RuntimeStore } from './runtime-store-contract'

export type WorkspaceGitHubCacheSnapshot = PersistedState['githubCache']
export function applyWorkspaceGitHubCache(
  store: Pick<RuntimeStore, 'getGitHubCache' | 'setGitHubCache'>,
  expected: WorkspaceGitHubCacheSnapshot,
  next: WorkspaceGitHubCacheSnapshot
): { appliedInMemory: true; durable: false } {
  if (!store.getGitHubCache || !store.setGitHubCache) {
    throw new Error('workspace_review_cache_store_unavailable')
  }
  if (!isDeepStrictEqual(store.getGitHubCache(), expected)) {
    throw new Error('workspace_review_cache_changed')
  }
  store.setGitHubCache(next)
  if (!isDeepStrictEqual(store.getGitHubCache(), next)) {
    throw new Error('workspace_review_cache_write_unverified')
  }
  return { appliedInMemory: true, durable: false }
}
