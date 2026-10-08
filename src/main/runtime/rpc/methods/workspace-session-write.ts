import { defineMethod } from '../core'
import { WorkspaceSessionWriteParams } from '../../../../shared/rpc-contract/workspace-session-write-params'

export const WORKSPACE_SESSION_WRITE_METHODS = [
  defineMethod({
    name: 'session.replaceState',
    params: WorkspaceSessionWriteParams,
    handler: async (params, { runtime, signal }) => {
      const receipt = await runtime.replaceWorkspaceSessionState(params, signal)
      if (!receipt.applied) {
        throw new Error(
          receipt.reason === 'cancelled' ? 'request_cancelled' : 'workspace_session_changed'
        )
      }
      return receipt
    }
  })
]
