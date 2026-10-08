import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime/types'
import { readAgentSessionRequest } from './agent-session-request'
import { requireLosslessWorkspaceSession } from '../../shared/node-workspace-session-validation'
import { WorkspaceSessionWriteParams } from '../../shared/rpc-contract/workspace-session-write-params'

export const WORKSPACE_SESSION_WRITE_HANDLERS: Record<string, CommandHandler> = {
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
