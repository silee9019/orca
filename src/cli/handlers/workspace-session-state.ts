import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { readAgentSessionRequest } from './agent-session-request'
import {
  WorkspaceSessionStateReadParams,
  WorkspaceSessionStateFlushParams
} from '../../shared/rpc-contract/workspace-session-state-params'

export const WORKSPACE_SESSION_STATE_HANDLERS: Record<string, CommandHandler> = {
  'terminal session-state': async (ctx) => {
    const params = await readAgentSessionRequest(ctx, WorkspaceSessionStateReadParams)
    const response = await ctx.client.call('session.readState', params)
    printResult(response, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'terminal flush-session': async (ctx) => {
    const params = await readAgentSessionRequest(ctx, WorkspaceSessionStateFlushParams)
    const response = await ctx.client.call('session.flush', params)
    printResult(response, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
