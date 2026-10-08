import type { CommandHandler } from '../dispatch'
import {
  DesktopDownloadSessionStart,
  DesktopDownloadSessionRequest,
  DesktopDownloadSessionAppend
} from '../../shared/rpc-contract/workspace-download-session-params'
import { readWorkspaceCommandInput, confirmWorkspaceCommand } from '../workspace-command-input'
import { printWorkspaceCommandResult } from '../workspace-command-result'
export const WORKSPACE_DOWNLOAD_SESSION_HANDLERS: Record<string, CommandHandler> = {
  'file download-session-start': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopDownloadSessionStart)
    confirmWorkspaceCommand(ctx, params.destinationPath)
    const response = await ctx.client.call('files.desktopDownloadSessionStart', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'file download-session-status': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopDownloadSessionRequest)
    const response = await ctx.client.call('files.desktopDownloadSessionStatus', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'file download-session-append': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopDownloadSessionAppend)
    confirmWorkspaceCommand(ctx, params.requestId)
    const response = await ctx.client.call('files.desktopDownloadSessionAppend', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'file download-session-finish': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopDownloadSessionRequest)
    confirmWorkspaceCommand(ctx, params.requestId)
    const response = await ctx.client.call('files.desktopDownloadSessionFinish', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'file download-session-cancel': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopDownloadSessionRequest)
    confirmWorkspaceCommand(ctx, params.requestId)
    const response = await ctx.client.call('files.desktopDownloadSessionCancel', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  }
}
