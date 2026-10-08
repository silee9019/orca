import type { CommandHandler } from '../dispatch'
import { printWorkspaceCommandResult } from '../workspace-command-result'

export const WORKSPACE_IMPORT_PREVIEW_HANDLERS: Record<string, CommandHandler> = {
  'settings preview-ghostty-import': async (ctx) => {
    const response = await ctx.client.call('settings.previewGhosttyImport')
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'settings preview-warp-auto': async (ctx) => {
    const response = await ctx.client.call('settings.previewWarpThemeAutoImport')
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
