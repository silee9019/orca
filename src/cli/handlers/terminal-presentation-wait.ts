import { z } from 'zod'
import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { readAgentSessionRequest } from './agent-session-request'
import { TerminalPresentationWaitParams } from '../../shared/rpc-contract/terminal-presentation-wait-params'

async function wait(ctx: Parameters<CommandHandler>[0], method: string) {
  const params = await readAgentSessionRequest(ctx, TerminalPresentationWaitParams)
  const response = await ctx.client.call(method, params)
  printResult(response, ctx.json, (value) => JSON.stringify(value))
  if (!z.object({ observed: z.literal(true) }).safeParse(response.result).success) {
    process.exitCode = 1
  }
}
export const TERMINAL_PRESENTATION_WAIT_HANDLERS: Record<string, CommandHandler> = {
  'terminal wait-driver': (ctx) => wait(ctx, 'terminal.waitDriver'),
  'terminal wait-fit': (ctx) => wait(ctx, 'terminal.waitFit')
}
