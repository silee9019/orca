import type { ExecutionHostId } from '../../../../shared/execution-host'
import type { RemoveWorktreeResult } from '../../../../shared/worktree/create-types'
import { DesktopWorktreeForget } from '../../../../shared/rpc-contract/workspace-worktree-forget-params'
import { defineMethod } from '../core'
type ForgetWorktree = (args: {
  worktreeId: string
  hostId: ExecutionHostId
}) => Promise<RemoveWorktreeResult>
let forget: ForgetWorktree | null = null
export function setDesktopWorktreeForgetForRpc(operation: ForgetWorktree | null): void {
  forget = operation
}
export const WORKSPACE_WORKTREE_FORGET_METHODS = [
  defineMethod({
    name: 'worktree.forgetDesktop',
    params: DesktopWorktreeForget,
    handler: async (params) => {
      if (!forget) {
        throw new Error('runtime_unavailable')
      }
      await forget({ worktreeId: params.worktreeId, hostId: params.hostId })
      return {
        forgotten: true,
        worktreeId: params.worktreeId,
        hostId: params.hostId,
        executionVerdict: 'unverifiable' as const
      }
    }
  })
]
