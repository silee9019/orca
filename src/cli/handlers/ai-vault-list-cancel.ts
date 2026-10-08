import { z } from 'zod'
import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { readAgentSessionRequest } from './agent-session-request'
import { AiVaultListCancelParams } from '../../shared/rpc-contract/ai-vault-list-cancel-params'

export const AI_VAULT_LIST_CANCEL_HANDLERS: Record<string, CommandHandler> = {
  'agent history cancel': async (ctx) => {
    const params = await readAgentSessionRequest(ctx, AiVaultListCancelParams)
    const response = await ctx.client.call('aiVault.cancelOwnedListSessions', params)
    printResult(response, ctx.json, (value) => JSON.stringify(value))
    if (!z.object({ cancelRequested: z.literal(true) }).safeParse(response.result).success) {
      process.exitCode = 1
    }
  }
}
