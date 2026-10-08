import type { CommandHandler } from '../dispatch'
import {
  DesktopProvisionedRootAdopt,
  getDesktopAdoptionConfirmation
} from '../../shared/rpc-contract/workspace-desktop-adopt-params'
import { readWorkspaceCommandInput, confirmWorkspaceCommand } from '../workspace-command-input'
import { printWorkspaceCommandResult } from '../workspace-command-result'
export const WORKSPACE_DESKTOP_ADOPT_HANDLERS: Record<string, CommandHandler> = {
  'worktree adopt-desktop-provisioned-root': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopProvisionedRootAdopt)
    confirmWorkspaceCommand(ctx, getDesktopAdoptionConfirmation(params))
    const response = await ctx.client.call('worktree.adoptDesktopProvisionedRoot', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  }
}
