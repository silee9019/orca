import type { CommandHandler } from '../dispatch'
import { WorkspaceCleanupDismiss } from '../../shared/rpc-contract/workspace-cleanup-dismissal-params'
import { readWorkspaceCommandInput, confirmWorkspaceCommand } from '../workspace-command-input'
import { printWorkspaceCommandResult } from '../workspace-command-result'

export const WORKSPACE_CLEANUP_DISMISSAL_HANDLERS: Record<string, CommandHandler> = {
  'workspace-cleanup dismiss': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, WorkspaceCleanupDismiss)
    const result = await ctx.client.call('workspaceCleanup.dismiss', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'workspace-cleanup clear-dismissals': async (ctx) => {
    confirmWorkspaceCommand(ctx, 'workspace-cleanup')
    const result = await ctx.client.call('workspaceCleanup.clearDismissals')
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
