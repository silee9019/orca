import type { CommandHandler } from '../dispatch'
import { RuntimeClientError } from '../runtime-client'
import { printWorkspaceCommandResult } from '../workspace-command-result'
import { readWorkspaceCommandInput, confirmWorkspaceCommand } from '../workspace-command-input'
import { BitbucketConnect } from '../../shared/rpc-contract/bitbucket-params'

export const WORKSPACE_BITBUCKET_HANDLERS: Record<string, CommandHandler> = {
  'bitbucket connect': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, BitbucketConnect)
    try {
      const result = await ctx.client.call<{ ok?: unknown }>('bitbucket.connect', params)
      if (result.result?.ok !== true) {
        throw new Error('Connection rejected')
      }
      printWorkspaceCommandResult({ ...result, result: { ok: true } }, ctx.json, () => 'Connected.')
    } catch (error) {
      throw new RuntimeClientError(
        error instanceof RuntimeClientError ? error.code : 'connection_failed',
        'Bitbucket connection failed. Check credentials and host connectivity.'
      )
    }
  },
  'bitbucket disconnect': async (ctx) => {
    confirmWorkspaceCommand(ctx, 'stored-bitbucket-credential')
    const result = await ctx.client.call('bitbucket.disconnect')
    printWorkspaceCommandResult(result, ctx.json, () => 'Stored Bitbucket credential removed.')
  },
  'bitbucket status': async (ctx) => {
    const result = await ctx.client.call('bitbucket.status')
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
