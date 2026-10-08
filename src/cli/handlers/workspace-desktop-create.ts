import type { CommandHandler } from '../dispatch'
import {
  DesktopWorktreeCreate,
  getDesktopCreateConfirmation
} from '../../shared/rpc-contract/workspace-desktop-create-params'
import { readWorkspaceCommandInput, confirmWorkspaceCommand } from '../workspace-command-input'
import { printWorkspaceCommandResult } from '../workspace-command-result'
export const WORKSPACE_DESKTOP_CREATE_HANDLERS: Record<string, CommandHandler> = {
  'worktree create-desktop': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopWorktreeCreate)
    confirmWorkspaceCommand(ctx, getDesktopCreateConfirmation(params))
    const response = await ctx.client.call('worktree.createDesktop', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  }
}
