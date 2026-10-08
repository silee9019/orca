import type { CommandHandler } from '../dispatch'
import { DesktopWorktreeMetaUpdate } from '../../shared/rpc-contract/workspace-desktop-meta-params'
import { readWorkspaceCommandInput, confirmWorkspaceCommand } from '../workspace-command-input'
import { printWorkspaceCommandResult } from '../workspace-command-result'

export const WORKSPACE_DESKTOP_META_HANDLERS: Record<string, CommandHandler> = {
  'worktree update-desktop-meta': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopWorktreeMetaUpdate)
    confirmWorkspaceCommand(ctx, params.worktreeId)
    const response = await ctx.client.call('worktree.updateDesktopMetadata', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  }
}
