import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime/types'
import { readAgentSessionRequest } from './agent-session-request'
import {
  TerminalHostViewportParams,
  TerminalHostViewportReceipt
} from '../../shared/rpc-contract/terminal-host-viewport-params'
export const TERMINAL_HOST_VIEWPORT_HANDLERS: Record<string, CommandHandler> = {
  'terminal claim-host-viewport': async (ctx) => {
    const target = await readAgentSessionRequest(ctx, TerminalHostViewportParams),
      response = await ctx.client.call('terminal.claimHostViewport', target),
      receipt = TerminalHostViewportReceipt.safeParse(response.result)
    if (
      !receipt.success ||
      receipt.data.ptyId !== target.expectedPtyId ||
      receipt.data.executionHostId !== target.expectedExecutionHostId ||
      receipt.data.rendererId !== target.expectedRendererId ||
      receipt.data.requested.cols !== target.cols ||
      receipt.data.requested.rows !== target.rows
    ) {
      throw new RuntimeClientError(
        'invalid_runtime_response',
        'The host returned an invalid viewport claim receipt.'
      )
    }
    printResult({ ...response, result: receipt.data }, ctx.json, (value) => JSON.stringify(value))
    if (!receipt.data.hostResizeEligible) {
      process.exitCode = 1
    }
  }
}
