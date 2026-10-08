import type { z } from 'zod'
import type { Store } from './persistence'
import type { DesktopFileSearchStart } from '../shared/rpc-contract/workspace-file-search-params'
import type { RpcContext } from './runtime/rpc/core'
import { DesktopFileSearchController } from './desktop-file-search-controller'
import { resolveDesktopWorktreeInstance } from './desktop-worktree-instance'
import { getSshFilesystemProvider } from './providers/ssh-filesystem-dispatch'
import { getSshProviderAuthority } from './ssh/ssh-provider-authority'
import { setDesktopFileSearchForRpc } from './runtime/rpc/methods/workspace-file-search'
export type DesktopFileSearchServices = {
  controller: DesktopFileSearchController
  start: (
    params: z.infer<typeof DesktopFileSearchStart>,
    runtime: RpcContext['runtime']
  ) => ReturnType<DesktopFileSearchController['start']>
}
const controllers = new WeakMap<Store, DesktopFileSearchController>()
export function registerDesktopFileSearchForRpc(store: Store): void {
  let controller = controllers.get(store)
  if (!controller) {
    controller = new DesktopFileSearchController()
    controllers.set(store, controller)
  }
  const search = controller
  setDesktopFileSearchForRpc({
    controller: search,
    start: (params, runtime) =>
      search.start(async (signal) => {
        const { target, expectedExecutionHostId: _host, maxResults, ...options } = params
        if (target.executionHostId !== 'local' && !target.executionHostId.startsWith('ssh:')) {
          throw new Error('Unsupported Desktop search host.')
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
        const selector =
          'identityKey' in target ? `identity:${target.identityKey}` : `id:${target.worktreeId}`
        const files = await runtime.searchRuntimeFiles(
          selector,
          { ...options, maxResults },
          { signal }
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
