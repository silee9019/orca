import type { CommandHandler } from '../dispatch'
import { DesktopWorktreeLineageUpdate } from '../../shared/rpc-contract/workspace-lineage-params'
import { readWorkspaceCommandInput, confirmWorkspaceCommand } from '../workspace-command-input'
import { printWorkspaceCommandResult } from '../workspace-command-result'

export const WORKSPACE_LINEAGE_HANDLERS: Record<string, CommandHandler> = {
  'worktree update-desktop-lineage': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopWorktreeLineageUpdate)
    confirmWorkspaceCommand(ctx, params.target.identityKey)
    const response = await ctx.client.call('worktree.updateDesktopLineage', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  }
}
