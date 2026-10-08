import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'

export const WORKSPACE_REVIEW_CACHE_HANDLERS: Record<string, CommandHandler> = {
  'agent workspace-cache github': async (ctx) => {
    const response = await ctx.client.call('cache.getGitHub', {})
    printResult(response, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
