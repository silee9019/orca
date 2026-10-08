import type { BrowserWindow } from 'electron'
import type { z } from 'zod'
import type { Store } from './persistence'
import type { DesktopLocalCloneStart } from '../shared/rpc-contract/workspace-local-clone-params'
import { getRepoExecutionHostId } from '../shared/execution-host'
import { isFolderRepo } from '../shared/repo-kind'
import { deriveValidatedClonePath, getClonePathComparisonKey } from './git/repo-clone-path'
import { cloneLocalRepo } from './desktop-local-clone'
import { DesktopRepositoryCloneController } from './desktop-repository-clone-controller'
import { setDesktopLocalCloneForRpc } from './runtime/rpc/methods/workspace-local-clone'
export type DesktopLocalCloneService = {
  controller: DesktopRepositoryCloneController
  start: (
    params: z.infer<typeof DesktopLocalCloneStart>
  ) => ReturnType<DesktopRepositoryCloneController['start']>
}
const controllers = new WeakMap<Store, DesktopRepositoryCloneController>()
export function registerDesktopLocalCloneForRpc(store: Store, mainWindow: BrowserWindow): void {
  let controller = controllers.get(store)
  if (!controller) {
    controller = new DesktopRepositoryCloneController()
    controllers.set(store, controller)
  }
  const clones = controller
  setDesktopLocalCloneForRpc({
    controller: clones,
    start: (params) =>
      clones.start(async (abort, onProgress) => {
        const path = deriveValidatedClonePath(params)
        const key = getClonePathComparisonKey(path)
        const validateHost = () => {
          abort.signal.throwIfAborted()
          const owners = store
            .getRepos()
            .filter((repo) => getClonePathComparisonKey(repo.path) === key)
          if (
            owners.length > 1 ||
            owners.some((repo) => getRepoExecutionHostId(repo) !== 'local')
          ) {
            throw new Error('Selected native clone ownership changed or ambiguous.')
          }
        }
        validateHost()
        const repo = await cloneLocalRepo(store, mainWindow, params, {
          controller: abort,
          onProgress,
          validateHost
        })
        validateHost()
        if (
          isFolderRepo(repo) ||
          getRepoExecutionHostId(repo) !== 'local' ||
          store.getRepos().filter((row) => row.id === repo.id).length !== 1
        ) {
          throw new Error('Cloned repository ownership is ambiguous.')
        }
        await store.flushPendingOrThrowAsync()
        validateHost()
        return { repoId: repo.id, path: repo.path, executionHostId: 'local', kind: 'git' }
      })
  })
}
