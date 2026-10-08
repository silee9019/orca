import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime/types'
import { readAgentSessionRequest } from './agent-session-request'
import {
  TerminalHostResizeParams,
  TerminalHostResizeReceipt
} from '../../shared/rpc-contract/terminal-host-resize-params'
export const TERMINAL_HOST_RESIZE_HANDLERS: Record<string, CommandHandler> = {
  'terminal resize-host': async (ctx) => {
    const target = await readAgentSessionRequest(ctx, TerminalHostResizeParams),
      response = await ctx.client.call('terminal.resizeHost', target),
      receipt = TerminalHostResizeReceipt.safeParse(response.result)
    if (
      !receipt.success ||
      receipt.data.ptyId !== target.expectedPtyId ||
      receipt.data.executionHostId !== target.expectedExecutionHostId ||
      receipt.data.requested.cols !== target.cols ||
      receipt.data.requested.rows !== target.rows
    ) {
      throw new RuntimeClientError(
        'invalid_runtime_response',
        'The host returned an invalid resize receipt.'
      )
    }
    printResult({ ...response, result: receipt.data }, ctx.json, (value) => JSON.stringify(value))
    if (!receipt.data.providerApplied) {
      process.exitCode = 1
    }
  }
}
