import type { CommandHandler } from '../dispatch'
import { confirmWorkspaceCommand } from '../workspace-command-input'
import { printWorkspaceCommandResult } from '../workspace-command-result'

export const WORKSPACE_KEYBINDING_FILE_HANDLERS: Record<string, CommandHandler> = {
  'keybindings ensure-file': async (ctx) => {
    const result = await ctx.client.call('keybindings.ensureFile')
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'keybindings open-file': async (ctx) => {
    confirmWorkspaceCommand(ctx, 'keybindings')
    const result = await ctx.client.call('keybindings.openFile')
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'keybindings reveal-file': async (ctx) => {
    confirmWorkspaceCommand(ctx, 'keybindings')
    const result = await ctx.client.call('keybindings.revealFile')
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
