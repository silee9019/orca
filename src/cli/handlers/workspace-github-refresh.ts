import type { CommandHandler } from '../dispatch'
import { DesktopGitHubRefresh } from '../../shared/rpc-contract/workspace-github-refresh-params'
import { readWorkspaceCommandInput, confirmWorkspaceCommand } from '../workspace-command-input'
import { printWorkspaceCommandResult } from '../workspace-command-result'
export const WORKSPACE_GITHUB_REFRESH_HANDLERS: Record<string, CommandHandler> = {
  'github refresh-pr-now': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopGitHubRefresh)
    confirmWorkspaceCommand(ctx, params.repoId)
    const response = await ctx.client.call('github.refreshDesktopPRNow', params, {
      timeoutMs: 120000
    })
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'github enqueue-pr-refresh': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopGitHubRefresh)
    confirmWorkspaceCommand(ctx, params.repoId)
    const response = await ctx.client.call('github.enqueueDesktopPRRefresh', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  }
}
