import type { CommandHandler } from '../dispatch'
import {
  DesktopFileListStart,
  DesktopFileListRequest,
  DesktopFileListResult
} from '../../shared/rpc-contract/workspace-file-list-params'
import { readWorkspaceCommandInput } from '../workspace-command-input'
import { printWorkspaceCommandResult } from '../workspace-command-result'
export const WORKSPACE_FILE_LIST_HANDLERS: Record<string, CommandHandler> = {
  'file desktop-list-start': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopFileListStart)
    const response = await ctx.client.call('files.desktopListStart', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'file desktop-list-status': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopFileListRequest)
    const response = await ctx.client.call('files.desktopListStatus', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'file desktop-list-cancel': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopFileListRequest)
    const response = await ctx.client.call('files.desktopListCancel', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'file desktop-list-result': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopFileListResult)
    const response = await ctx.client.call('files.desktopListResult', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  }
}
