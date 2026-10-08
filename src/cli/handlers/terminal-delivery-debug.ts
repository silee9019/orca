import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { readAgentSessionRequest } from './agent-session-request'
import { TerminalDeliveryDebugResetParams } from '../../shared/rpc-contract/terminal-delivery-debug-params'

export const TERMINAL_DELIVERY_DEBUG_HANDLERS: Record<string, CommandHandler> = {
  'terminal delivery-debug': async (ctx) => {
    const response = await ctx.client.call('terminal.deliveryDebug', {})
    printResult(response, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'terminal reset-delivery-debug': async (ctx) => {
    const params = await readAgentSessionRequest(ctx, TerminalDeliveryDebugResetParams)
    const response = await ctx.client.call('terminal.resetDeliveryDebug', params)
    printResult(response, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
