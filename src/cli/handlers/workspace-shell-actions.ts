import type { CommandHandler } from '../dispatch'
import {
  DesktopShellOpenFile,
  DesktopShellOpenUri,
  DesktopShellReveal,
  DesktopShellOpenEditor
} from '../../shared/rpc-contract/workspace-shell-action-params'
import { readWorkspaceCommandInput, confirmWorkspaceCommand } from '../workspace-command-input'
import { printWorkspaceCommandResult } from '../workspace-command-result'

export const WORKSPACE_SHELL_ACTION_HANDLERS: Record<string, CommandHandler> = {
  'shell open-file': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopShellOpenFile)
    confirmWorkspaceCommand(ctx, params.path)
    const response = await ctx.client.call('shell.openDesktopFile', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'shell open-file-uri': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopShellOpenUri)
    confirmWorkspaceCommand(ctx, params.uri)
    const response = await ctx.client.call('shell.openDesktopFileUri', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'shell reveal': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopShellReveal)
    confirmWorkspaceCommand(ctx, params.path)
    const response = await ctx.client.call('shell.revealDesktopPath', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'shell open-editor': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopShellOpenEditor)
    confirmWorkspaceCommand(ctx, params.path)
    const response = await ctx.client.call('shell.openDesktopEditor', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  }
}
