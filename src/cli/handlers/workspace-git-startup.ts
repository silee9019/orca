import type { CommandHandler } from '../dispatch'
import { printWorkspaceCommandResult } from '../workspace-command-result'

export const WORKSPACE_GIT_STARTUP_HANDLERS: Record<string, CommandHandler> = {
  'git await-environment': async (ctx) => {
    const result = await ctx.client.call('git.awaitEnvironmentStartupBarrier')
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
