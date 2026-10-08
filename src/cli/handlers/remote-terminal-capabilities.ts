import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { readAgentSessionRequest } from './agent-session-request'
import { PreflightDetectRemoteWindowsTerminalCapabilities } from '../../shared/rpc-contract/preflight-params'

export const REMOTE_TERMINAL_CAPABILITIES_HANDLERS: Record<string, CommandHandler> = {
  'terminal remote-capabilities': async (ctx) => {
    const params = await readAgentSessionRequest(
      ctx,
      PreflightDetectRemoteWindowsTerminalCapabilities
    )
    const response = await ctx.client.call(
      'preflight.detectRemoteWindowsTerminalCapabilities',
      params
    )
    printResult(response, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
