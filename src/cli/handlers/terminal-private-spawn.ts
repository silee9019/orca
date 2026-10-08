import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime/types'
import { readAgentSessionRequest } from './agent-session-request'
import {
  TerminalPrivateSpawnParams,
  TerminalPrivateSpawnReceipt
} from '../../shared/rpc-contract/terminal-private-spawn-params'
export const TERMINAL_PRIVATE_SPAWN_HANDLERS: Record<string, CommandHandler> = {
  'terminal spawn': async (ctx) => {
    const target = await readAgentSessionRequest(ctx, TerminalPrivateSpawnParams),
      response = await ctx.client.call('terminal.spawnPrivate', target),
      receipt = TerminalPrivateSpawnReceipt.safeParse(response.result)
    if (
      !receipt.success ||
      receipt.data.expectedRuntimeId !== target.expectedRuntimeId ||
      receipt.data.clientMutationId !== target.clientMutationId ||
      receipt.data.terminal.worktreeId !== target.worktreeId ||
      receipt.data.terminal.executionHostId !== target.expectedExecutionHostId ||
      receipt.data.requested.cols !== target.cols ||
      receipt.data.requested.rows !== target.rows
    ) {
      throw new RuntimeClientError(
        'invalid_runtime_response',
        'The host returned an invalid private spawn receipt.'
      )
    }
    printResult({ ...response, result: receipt.data }, ctx.json, (value) => JSON.stringify(value))
  }
}
