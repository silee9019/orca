import type { CommandHandler } from '../dispatch'
import {
  DesktopRepoAddLocal,
  DesktopRepoAddRemote
} from '../../shared/rpc-contract/workspace-repo-add-params'
import { readWorkspaceCommandInput, confirmWorkspaceCommand } from '../workspace-command-input'
import { printWorkspaceCommandResult } from '../workspace-command-result'
export const WORKSPACE_REPO_ADD_HANDLERS: Record<string, CommandHandler> = {
  'repo add-desktop-local': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopRepoAddLocal)
    confirmWorkspaceCommand(ctx, params.path)
    const response = await ctx.client.call('repo.addDesktopLocal', params, { timeoutMs: 120000 })
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'repo add-desktop-remote': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopRepoAddRemote)
    confirmWorkspaceCommand(ctx, params.remotePath)
    const response = await ctx.client.call('repo.addDesktopRemote', params, { timeoutMs: 120000 })
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  }
}
