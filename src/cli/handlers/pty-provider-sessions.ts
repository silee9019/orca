import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { PtyProviderSessionsParams } from '../../shared/rpc-contract/pty-provider-sessions-params'
import { readAgentSessionRequest } from './agent-session-request'

export const PTY_PROVIDER_SESSION_HANDLERS: Record<string, CommandHandler> = {
  'terminal provider-sessions': async (ctx) => {
    const params = await readAgentSessionRequest(ctx, PtyProviderSessionsParams)
    const result = await ctx.client.call('terminal.listProviderSessions', params)
    printResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
