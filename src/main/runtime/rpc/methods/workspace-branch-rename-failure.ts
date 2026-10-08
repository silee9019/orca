import { BranchRenameFailureRead } from '../../../../shared/rpc-contract/workspace-branch-rename-failure-params'
import { defineMethod, type RpcContext } from '../core'
type FailureOutputReader = (worktreeId: string) => string | null
let reader: FailureOutputReader | null = null
export function setBranchRenameFailureReaderForRpc(value: FailureOutputReader | null): void {
  reader = value
}
// Why: the diagnostic is for the local desktop user and must never reach paired or remote clients.
function assertLocalSocketCaller(context: RpcContext): void {
  if (
    context.connectionId ||
    context.clientId ||
    context.clientKind ||
    context.pairedDeviceId ||
    context.authenticatedCallerFingerprint
  ) {
    throw new Error('local_only')
  }
}
export const WORKSPACE_BRANCH_RENAME_FAILURE_METHODS = [
  defineMethod({
    name: 'worktrees.branchRenameFailureOutput',
    params: BranchRenameFailureRead,
    handler: (params, context) => {
      assertLocalSocketCaller(context)
      if (!reader) {
        throw new Error('runtime_unavailable')
      }
      return { output: reader(params.worktreeId) }
    }
  })
]
