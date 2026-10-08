import type { CommandHandler } from '../dispatch'
import { DesktopRepoCreateRemote } from '../../shared/rpc-contract/workspace-repo-create-remote-params'
import { readWorkspaceCommandInput, confirmWorkspaceCommand } from '../workspace-command-input'
import { printWorkspaceCommandResult } from '../workspace-command-result'
export const WORKSPACE_REPO_CREATE_REMOTE_HANDLERS: Record<string, CommandHandler> = {
  'repo create-desktop-remote': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopRepoCreateRemote)
    confirmWorkspaceCommand(ctx, `${params.connectionId}:${params.parentPath}:${params.name}`)
    const response = await ctx.client.call('repo.createDesktopRemote', params, {
      timeoutMs: 120000
    })
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  }
}
