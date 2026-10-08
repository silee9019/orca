import type { BrowserWindow } from 'electron'
import type { z } from 'zod'
import type { Store } from './persistence'
import type { DesktopRemoteCloneStart } from '../shared/rpc-contract/workspace-remote-clone-params'
import { getRepoExecutionHostId } from '../shared/execution-host'
import { isFolderRepo } from '../shared/repo-kind'
import { cloneRemoteRepo } from './ipc/repos/remote-repo-clone'
import { getSshGitProvider } from './providers/ssh-git-dispatch'
import { getSshFilesystemProvider } from './providers/ssh-filesystem-dispatch'
import { getSshProviderAuthority } from './ssh/ssh-provider-authority'
import { DesktopRemoteCloneController } from './desktop-remote-clone-controller'
import { setDesktopRemoteCloneForRpc } from './runtime/rpc/methods/workspace-remote-clone'
export type DesktopRemoteCloneService = {
  controller: DesktopRemoteCloneController
  start: (
    params: z.infer<typeof DesktopRemoteCloneStart>
  ) => ReturnType<DesktopRemoteCloneController['start']>
}
const controllers = new WeakMap<Store, DesktopRemoteCloneController>()
export function registerDesktopRemoteCloneForRpc(
  store: Store,
  mainWindow: BrowserWindow,
  onChanged: () => void
): void {
  let controller = controllers.get(store)
  if (!controller) {
    controller = new DesktopRemoteCloneController()
    controllers.set(store, controller)
  }
  const clones = controller
  setDesktopRemoteCloneForRpc({
    controller: clones,
    start: (params) =>
      clones.start(async (abort, onProgress) => {
        const { expectedCloneHostId, url, destination } = params
        const connectionId = expectedCloneHostId.slice(4)
        const git = getSshGitProvider(connectionId)
        const files = getSshFilesystemProvider(connectionId)
        const authority = getSshProviderAuthority(connectionId)
        const validateHost = () => {
          abort.signal.throwIfAborted()
          if (
            !git ||
            !files ||
            getSshGitProvider(connectionId) !== git ||
            getSshFilesystemProvider(connectionId) !== files ||
            getSshProviderAuthority(connectionId) !== authority
          ) {
            throw new Error('Selected clone host changed or unavailable.')
          }
        }
        validateHost()
        const repo = await cloneRemoteRepo(
          store,
          mainWindow,
          { connectionId, url, destination },
          { controller: abort, onProgress, validateHost }
        )
        validateHost()
        if (
          isFolderRepo(repo) ||
          getRepoExecutionHostId(repo) !== expectedCloneHostId ||
          store.getRepos().filter((row) => row.id === repo.id).length !== 1
        ) {
          throw new Error('Cloned repository ownership is ambiguous.')
        }
        onChanged()
        await store.flushPendingOrThrowAsync()
        validateHost()
        return {
          repoId: repo.id,
          path: repo.path,
          executionHostId: expectedCloneHostId,
          kind: 'git'
        }
      })
  })
}
