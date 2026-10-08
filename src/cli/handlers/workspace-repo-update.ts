import type { CommandHandler } from '../dispatch'
import { DesktopRepoUpdate } from '../../shared/rpc-contract/workspace-repo-update-params'
import { readWorkspaceCommandInput, confirmWorkspaceCommand } from '../workspace-command-input'
import { printWorkspaceCommandResult } from '../workspace-command-result'

export const WORKSPACE_REPO_UPDATE_HANDLERS: Record<string, CommandHandler> = {
  'repo update-desktop': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopRepoUpdate)
    confirmWorkspaceCommand(ctx, params.repoId)
    const response = await ctx.client.call('repo.updateDesktop', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  }
}
