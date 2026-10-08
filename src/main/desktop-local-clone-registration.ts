import { randomUUID } from 'node:crypto'
import type { BrowserWindow } from 'electron'
import type { Store } from './persistence'
import type { Repo } from '../shared/repo-types'
import { isFolderRepo } from '../shared/repo-kind'
import { DEFAULT_REPO_BADGE_COLOR } from '../shared/constants'
import { LOCAL_EXECUTION_HOST_ID } from '../shared/execution-host'
import { getRepoName } from './git/repo'
import { getClonePathComparisonKey } from './git/repo-clone-path'
import { detectRepoIconAndUpstream } from './repo-icon-autodetect'
import { prepareLocalWorktreeRootForRepo } from './worktree-root-preparation'
import { invalidateAuthorizedRootsCache } from './ipc/registered-worktree-roots-cache'
import { emitRepoAdded } from './ipc/repos/repo-added-telemetry'
import { notifyReposChanged } from './ipc/repos/repos-changed-notification'
import type { DesktopRepositoryCloneControl } from './desktop-repository-clone-control'
export async function registerLocalCloneResult(
  store: Store,
  mainWindow: BrowserWindow,
  clonePath: string,
  clonePathKey: string,
  controls?: DesktopRepositoryCloneControl
): Promise<Repo> {
  // Why: check after clone (path didn't exist before); reuse+upgrade a folder repo clone landed into instead of duplicating.
  controls?.validateHost()
  const existing = store.getRepos().find((r) => getClonePathComparisonKey(r.path) === clonePathKey)
  if (existing) {
    if (isFolderRepo(existing)) {
      const updated = store.updateRepo(existing.id, {
        kind: 'git',
        projectHostSetupMethod: 'cloned'
      })
      if (updated) {
        await prepareLocalWorktreeRootForRepo(store, updated)
        invalidateAuthorizedRootsCache()
        notifyReposChanged(mainWindow)
        // Why: folder→git upgrade is a real new git repo provisioning event.
        emitRepoAdded('clone_url', false, true)
        return updated
      }
    }
    emitRepoAdded('clone_url', true, true)
    return existing
  }

  const detected = await detectRepoIconAndUpstream({
    repoPath: clonePath,
    kind: 'git',
    executionHostId: LOCAL_EXECUTION_HOST_ID
  })
  controls?.validateHost()
  const repo: Repo = {
    id: randomUUID(),
    path: clonePath,
    displayName: getRepoName(clonePath),
    badgeColor: DEFAULT_REPO_BADGE_COLOR,
    ...detected,
    addedAt: Date.now(),
    kind: 'git',
    externalWorktreeVisibilityLegacy: false,
    projectHostSetupMethod: 'cloned'
  }

  store.addRepo(repo)
  await prepareLocalWorktreeRootForRepo(store, repo)
  invalidateAuthorizedRootsCache()
  notifyReposChanged(mainWindow)
  emitRepoAdded('clone_url', false, true)
  return repo
}
