import type { CommandHandler } from '../dispatch'
import { printWorkspaceCommandResult } from '../workspace-command-result'

export const WORKSPACE_CACHED_SCAN_HANDLERS: Record<string, CommandHandler> = {
  'workspace-cleanup cached-scan': async (ctx) => {
    const result = await ctx.client.call('workspaceCleanup.getCachedScan')
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'workspace-space cached-analysis': async (ctx) => {
    const result = await ctx.client.call('workspaceSpace.getCachedAnalysis')
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
