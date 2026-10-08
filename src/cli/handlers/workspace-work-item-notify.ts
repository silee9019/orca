import type { CommandHandler } from '../dispatch'
import { readWorkspaceCommandInput } from '../workspace-command-input'
import { printWorkspaceCommandResult } from '../workspace-command-result'
import { DesktopWorkItemNotify } from '../../shared/rpc-contract/workspace-work-item-notify-params'
export const WORKSPACE_WORK_ITEM_NOTIFY_HANDLERS: Record<string, CommandHandler> = {
  'github notify-work-item-mutated': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopWorkItemNotify)
    printWorkspaceCommandResult(
      await ctx.client.call('github.notifyDesktopWorkItemMutated', params),
      ctx.json,
      JSON.stringify
    )
  }
}
