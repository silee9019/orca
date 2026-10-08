import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { readAgentSessionRequest } from './agent-session-request'
import { TerminalStartupRestorationParams } from '../../shared/rpc-contract/terminal-startup-restoration-params'

export const TERMINAL_STARTUP_RESTORATION_HANDLERS: Record<string, CommandHandler> = {
  'terminal prepare-startup': async (ctx) => {
    const params = await readAgentSessionRequest(ctx, TerminalStartupRestorationParams)
    const response = await ctx.client.call('session.prepareTerminalStartupRestoration', params)
    printResult(response, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
