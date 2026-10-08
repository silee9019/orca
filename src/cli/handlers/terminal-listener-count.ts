import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime/types'
import { readAgentSessionRequest } from './agent-session-request'
import {
  TerminalListenerCountParams,
  TerminalListenerCountReceipt
} from '../../shared/rpc-contract/terminal-listener-count-params'
export const TERMINAL_LISTENER_COUNT_HANDLERS: Record<string, CommandHandler> = {
  'terminal data-listener-count': async (ctx) => {
    const target = await readAgentSessionRequest(ctx, TerminalListenerCountParams),
      response = await ctx.client.call('terminal.dataListenerCount', target),
      receipt = TerminalListenerCountReceipt.safeParse(response.result)
    if (
      !receipt.success ||
      receipt.data.expectedRuntimeId !== target.expectedRuntimeId ||
      receipt.data.executionHostId !== target.executionHostId ||
      receipt.data.rendererId !== target.expectedRendererId
    ) {
      throw new RuntimeClientError(
        'invalid_runtime_response',
        'The host returned an invalid listener count receipt.'
      )
    }
    printResult({ ...response, result: receipt.data }, ctx.json, (value) => JSON.stringify(value))
  }
}
