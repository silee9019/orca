import { defineMethod } from '../core'
import {
  WorkspaceSessionStateReadParams,
  WorkspaceSessionStateFlushParams
} from '../../../../shared/rpc-contract/workspace-session-state-params'

export const WORKSPACE_SESSION_STATE_METHODS = [
  defineMethod({
    name: 'session.readState',
    params: WorkspaceSessionStateReadParams,
    handler: (params, { runtime }) => ({
      session: runtime.readWorkspaceSessionState(params.hostId)
    })
  }),
  defineMethod({
    name: 'session.flush',
    params: WorkspaceSessionStateFlushParams,
    handler: async (_params, { runtime, signal }) => {
      await runtime.flushWorkspaceSessionState(signal)
      return { flushed: true }
    }
  })
]
