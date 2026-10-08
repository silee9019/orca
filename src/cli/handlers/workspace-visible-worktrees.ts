import type { CommandHandler } from '../dispatch'
import { DesktopVisibleWorktrees } from '../../shared/rpc-contract/workspace-visible-worktree-params'
import { readWorkspaceCommandInput } from '../workspace-command-input'
import { printWorkspaceCommandResult } from '../workspace-command-result'

export const WORKSPACE_VISIBLE_WORKTREE_HANDLERS: Record<string, CommandHandler> = {
  'worktree list-visible': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopVisibleWorktrees)
    const response = await ctx.client.call('worktree.listVisible', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'worktree list-all-visible': async (ctx) => {
    const response = await ctx.client.call('worktree.listAllVisible')
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
