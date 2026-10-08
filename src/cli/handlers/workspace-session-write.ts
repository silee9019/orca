import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime/types'
import { readAgentSessionRequest } from './agent-session-request'
import {
  requireLosslessWorkspaceSession,
  requireLosslessWorkspaceSessionPatch
} from '../../shared/node-workspace-session-validation'
import {
  WorkspaceSessionWriteParams,
  WorkspaceSessionPatchParams
} from '../../shared/rpc-contract/workspace-session-write-params'

export const WORKSPACE_SESSION_WRITE_HANDLERS: Record<string, CommandHandler> = {
  'terminal patch-session': async (ctx) => {
    const params = await readAgentSessionRequest(ctx, WorkspaceSessionPatchParams)
    try {
      requireLosslessWorkspaceSessionPatch(
        params.patch,
        requireLosslessWorkspaceSession(params.expected)
      )
    } catch {
      throw new RuntimeClientError(
        'invalid_argument',
        'Invalid session patch; values would require repair or removal.'
      )
    }
    printResult(await ctx.client.call('session.patchState', params), ctx.json, (value) =>
      JSON.stringify(value)
    )
  },
  'terminal set-session': async (ctx) => {
    const params = await readAgentSessionRequest(ctx, WorkspaceSessionWriteParams)
    try {
      requireLosslessWorkspaceSession(params.expected)
      requireLosslessWorkspaceSession(params.next)
    } catch {
      throw new RuntimeClientError(
        'invalid_argument',
        'Session input requires repair, drops fields or has invalid values.'
      )
    }
    printResult(await ctx.client.call('session.replaceState', params), ctx.json, (value) =>
      JSON.stringify(value)
    )
  }
}
