import type { CommandHandler } from '../dispatch'
import {
  DesktopDroppedPathsResolve,
  DesktopExternalPathImport
} from '../../shared/rpc-contract/workspace-external-path-import-params'
import { readWorkspaceCommandInput, confirmWorkspaceCommand } from '../workspace-command-input'
import { printWorkspaceCommandResult } from '../workspace-command-result'
export const WORKSPACE_EXTERNAL_PATH_IMPORT_HANDLERS: Record<string, CommandHandler> = {
  'file import-external-paths': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopExternalPathImport)
    confirmWorkspaceCommand(ctx, params.destDir)
    const response = await ctx.client.call('files.importDesktopExternalPaths', params)
    printWorkspaceCommandResult(response, ctx.json, JSON.stringify)
  },
  'file resolve-dropped-paths': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopDroppedPathsResolve)
    if (params.connectionId) {
      confirmWorkspaceCommand(ctx, params.worktreePath)
    }
    const response = await ctx.client.call('files.resolveDesktopDroppedPaths', params)
    printWorkspaceCommandResult(response, ctx.json, JSON.stringify)
  }
}
