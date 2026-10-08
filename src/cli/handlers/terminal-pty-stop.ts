import { z } from 'zod'
import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { readAgentSessionRequest } from './agent-session-request'
import { TerminalPtyStopParams } from '../../shared/rpc-contract/terminal-pty-stop-params'

export const TERMINAL_PTY_STOP_HANDLERS: Record<string, CommandHandler> = {
  'terminal stop-pty': async (ctx) => {
    const params = await readAgentSessionRequest(ctx, TerminalPtyStopParams)
    const response = await ctx.client.call('terminal.stopPty', params)
    printResult(response, ctx.json, (value) => JSON.stringify(value))
    if (
      !z
        .object({ settled: z.literal(true), status: z.literal('exited') })
        .safeParse(response.result).success
    ) {
      process.exitCode = 1
    }
  }
}
