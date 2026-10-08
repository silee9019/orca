import type { z } from 'zod'
import type { Store } from './persistence'
import type { DesktopGitStatusStart } from '../shared/rpc-contract/workspace-git-status-params'
import type { RpcContext } from './runtime/rpc/core'
import { DesktopGitStatusController } from './desktop-git-status-controller'
import { resolveDesktopWorktreeInstance } from './desktop-worktree-instance'
import { getSshGitProvider } from './providers/ssh-git-dispatch'
import { getSshProviderAuthority } from './ssh/ssh-provider-authority'
import { setDesktopGitStatusForRpc } from './runtime/rpc/methods/workspace-git-status'
export type DesktopGitStatusService = {
  controller: DesktopGitStatusController
  start: (
    params: z.infer<typeof DesktopGitStatusStart>,
    runtime: RpcContext['runtime']
  ) => ReturnType<DesktopGitStatusController['start']>
}
const controllers = new WeakMap<Store, DesktopGitStatusController>()
export function registerDesktopGitStatusForRpc(store: Store): void {
  let controller = controllers.get(store)
  if (!controller) {
    controller = new DesktopGitStatusController()
    controllers.set(store, controller)
  }
  const reads = controller
  setDesktopGitStatusForRpc({
    controller: reads,
    start: (params, runtime) =>
      reads.start(async (signal) => {
        const { target, expectedExecutionHostId: _host, ...options } = params
        if (target.executionHostId !== 'local' && !target.executionHostId.startsWith('ssh:')) {
          throw new Error('Unsupported Desktop Git host.')
        }
        signal.throwIfAborted()
        const worktree = await resolveDesktopWorktreeInstance({ store, runtime }, target)
        const connectionId = target.executionHostId.startsWith('ssh:')
          ? target.executionHostId.slice(4)
          : undefined
        const authority = connectionId ? getSshProviderAuthority(connectionId) : null
        const provider = connectionId ? getSshGitProvider(connectionId) : null
        if (connectionId && !provider) {
          throw new Error('Selected Git host unavailable.')
        }
        signal.throwIfAborted()
        const selector =
          'identityKey' in target ? `identity:${target.identityKey}` : `id:${target.worktreeId}`
        const result = await runtime.getRuntimeGitStatus(selector, {
          ...options,
          signal,
          admissionTier: 'status'
        })
        signal.throwIfAborted()
        const current = await resolveDesktopWorktreeInstance({ store, runtime }, target)
        if (
          current.path !== worktree.path ||
          current.instanceId !== worktree.instanceId ||
          (connectionId &&
            (getSshGitProvider(connectionId) !== provider ||
              getSshProviderAuthority(connectionId) !== authority))
        ) {
          throw new Error('Selected workspace changed.')
        }
        return result
      })
  })
}
