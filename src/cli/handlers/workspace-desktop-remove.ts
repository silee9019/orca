import type { CommandHandler } from '../dispatch'
import {
  DesktopWorktreeRemove,
  DesktopWorktreeRemovalPreview
} from '../../shared/rpc-contract/workspace-desktop-remove-params'
import { getDesktopLineageTargetConfirmation } from '../../shared/rpc-contract/workspace-lineage-params'
import { readWorkspaceCommandInput, confirmWorkspaceCommand } from '../workspace-command-input'
import { printWorkspaceCommandResult } from '../workspace-command-result'
export const WORKSPACE_DESKTOP_REMOVE_HANDLERS: Record<string, CommandHandler> = {
  'worktree preview-desktop-removal': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopWorktreeRemovalPreview)
    const response = await ctx.client.call('worktree.previewDesktopRemoval', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'worktree remove-desktop': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopWorktreeRemove)
    confirmWorkspaceCommand(ctx, getDesktopLineageTargetConfirmation(params.target))
    const response = await ctx.client.call('worktree.removeDesktop', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  }
}
