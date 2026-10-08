import { z } from 'zod'
import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { getRequiredStringFlag } from '../flags'
import { RuntimeClientError } from '../runtime/types'
import { readAgentSessionRequest } from './agent-session-request'
import { readTerminalSendText } from './terminal-send-text'
import { TerminalPtyInputTargetParams } from '../../shared/rpc-contract/terminal-pty-input-params'

export const TERMINAL_PTY_INPUT_HANDLERS: Record<string, CommandHandler> = {
  'terminal write-input': async (ctx) => writeInput(ctx, false),
  'terminal write-input-accepted': async (ctx) => writeInput(ctx, true)
}
async function writeInput(ctx: Parameters<CommandHandler>[0], acceptedOnly: boolean) {
  const input = getRequiredStringFlag(ctx.flags, 'text-file')
  if (input === '-' && getRequiredStringFlag(ctx.flags, 'request-file') === '-') {
    throw new RuntimeClientError('invalid_argument', 'Only one input can use stdin.')
  }
  const target = await readAgentSessionRequest(ctx, TerminalPtyInputTargetParams)
  const data = await readTerminalSendText(ctx.flags, ctx.cwd)
  if (!data) {
    throw new RuntimeClientError('invalid_argument', 'PTY input must not be empty.')
  }
  const response = await ctx.client.call(
    acceptedOnly ? 'terminal.writeInputAccepted' : 'terminal.writeInput',
    { ...target, data }
  )
  printResult(response, ctx.json, (value) => JSON.stringify(value))
  const receipt = acceptedOnly
    ? z.object({ queued: z.literal(true), accepted: z.literal(true) })
    : z.object({ queued: z.literal(true) })
  if (!receipt.safeParse(response.result).success) {
    process.exitCode = 1
  }
}
