import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { readAgentSessionRequest } from './agent-session-request'
import { WorkspaceGitHubCacheWriteParams } from '../../shared/rpc-contract/workspace-github-cache'

export const WORKSPACE_REVIEW_CACHE_WRITE_HANDLERS: Record<string, CommandHandler> = {
  'agent workspace-cache set-github': async (ctx) => {
    const params = await readAgentSessionRequest(ctx, WorkspaceGitHubCacheWriteParams)
    const response = await ctx.client.call('cache.setGitHub', params)
    printResult(response, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
