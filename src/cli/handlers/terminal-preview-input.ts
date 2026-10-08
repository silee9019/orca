import { z } from 'zod'
import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { getRequiredStringFlag } from '../flags'
import { RuntimeClientError } from '../runtime/types'
import { readAgentSessionRequest } from './agent-session-request'
import { readTerminalSendText } from './terminal-send-text'
import { TerminalPreviewInputTargetParams } from '../../shared/rpc-contract/terminal-preview-input-params'

export const TERMINAL_PREVIEW_INPUT_HANDLERS: Record<string, CommandHandler> = {
  'terminal preview-input': async (ctx) => {
    const input = getRequiredStringFlag(ctx.flags, 'text-file')
    if (input === '-' && getRequiredStringFlag(ctx.flags, 'request-file') === '-') {
      throw new RuntimeClientError('invalid_argument', 'Only one input can use stdin.')
    }
    const target = await readAgentSessionRequest(ctx, TerminalPreviewInputTargetParams)
    const data = await readTerminalSendText(ctx.flags, ctx.cwd)
    if (!data) {
      throw new RuntimeClientError('invalid_argument', 'Preview input must not be empty.')
    }
    const response = await ctx.client.call('terminal.previewInput', { ...target, data })
    printResult(response, ctx.json, (value) => JSON.stringify(value))
    if (!z.object({ accepted: z.literal(true) }).safeParse(response.result).success) {
      process.exitCode = 1
    }
  }
}
