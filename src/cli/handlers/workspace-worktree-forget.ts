import type { CommandHandler } from '../dispatch'
import { DesktopWorktreeForget } from '../../shared/rpc-contract/workspace-worktree-forget-params'
import { readWorkspaceCommandInput, confirmWorkspaceCommand } from '../workspace-command-input'
import { printWorkspaceCommandResult } from '../workspace-command-result'
export const WORKSPACE_WORKTREE_FORGET_HANDLERS: Record<string, CommandHandler> = {
  'worktree forget-desktop': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopWorktreeForget)
    confirmWorkspaceCommand(ctx, params.worktreeId)
    const response = await ctx.client.call('worktree.forgetDesktop', params, { timeoutMs: 120000 })
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  }
}
