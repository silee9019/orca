import type { z } from 'zod'
import type { Store } from './persistence'
import type { DesktopFileListStart } from '../shared/rpc-contract/workspace-file-list-params'
import type { RpcContext } from './runtime/rpc/core'
import { DesktopFileListController } from './desktop-file-list-controller'
import { listDesktopFiles } from './desktop-file-listing'
import { resolveDesktopWorktreeInstance } from './desktop-worktree-instance'
import { getSshFilesystemProvider } from './providers/ssh-filesystem-dispatch'
import { getSshProviderAuthority } from './ssh/ssh-provider-authority'
import { setDesktopFileListForRpc } from './runtime/rpc/methods/workspace-file-list'
export type DesktopFileListServices = {
  controller: DesktopFileListController
  start: (
    params: z.infer<typeof DesktopFileListStart>,
    runtime: RpcContext['runtime']
  ) => ReturnType<DesktopFileListController['start']>
}
const controllers = new WeakMap<Store, DesktopFileListController>()
export function registerDesktopFileListForRpc(store: Store): void {
  let controller = controllers.get(store)
  if (!controller) {
    controller = new DesktopFileListController()
    controllers.set(store, controller)
  }
  const listing = controller
  setDesktopFileListForRpc({
    controller: listing,
    start: (params, runtime) =>
      listing.start(async (signal) => {
        const { target, expectedExecutionHostId: _host, maxResults, ...options } = params
        if (target.executionHostId !== 'local' && !target.executionHostId.startsWith('ssh:')) {
          throw new Error('Unsupported Desktop listing host.')
        }
        signal.throwIfAborted()
        const worktree = await resolveDesktopWorktreeInstance({ store, runtime }, target)
        const connectionId = target.executionHostId.startsWith('ssh:')
          ? target.executionHostId.slice(4)
          : undefined
        const authority = connectionId ? getSshProviderAuthority(connectionId) : null
        const provider = connectionId ? getSshFilesystemProvider(connectionId) : null
        if (connectionId && !provider) {
          throw new Error('Selected host unavailable.')
        }
        signal.throwIfAborted()
        const files = await listDesktopFiles(
          store,
          { rootPath: worktree.path, connectionId, maxResults: maxResults + 1, ...options },
          signal
        )
        signal.throwIfAborted()
        const current = await resolveDesktopWorktreeInstance({ store, runtime }, target)
        if (
          current.path !== worktree.path ||
          current.instanceId !== worktree.instanceId ||
          (connectionId &&
            (getSshFilesystemProvider(connectionId) !== provider ||
              getSshProviderAuthority(connectionId) !== authority))
        ) {
          throw new Error('Selected workspace changed.')
        }
        return files
      }, params.maxResults)
  })
}
