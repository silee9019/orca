import { RuntimeClientError } from '../runtime-client'
import type { CommandHandler } from '../dispatch'
import {
  DesktopSaveDownloadedFile,
  DesktopSaveDownloadedResult,
  DesktopDownloadSessionStart,
  DesktopDownloadSessionRequest,
  DesktopDownloadSessionAppend
} from '../../shared/rpc-contract/workspace-download-session-params'
import { readWorkspaceCommandInput, confirmWorkspaceCommand } from '../workspace-command-input'
import { printWorkspaceCommandResult } from '../workspace-command-result'
export const WORKSPACE_DOWNLOAD_SESSION_HANDLERS: Record<string, CommandHandler> = {
  'file save-downloaded': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopSaveDownloadedFile)
    confirmWorkspaceCommand(ctx, params.destinationPath)
    const response = await ctx.client.call('files.desktopSaveDownloadedFile', params)
    const result = DesktopSaveDownloadedResult.parse(response.result)
    if (result.state !== 'finished') {
      throw new RuntimeClientError('operation_failed', 'Owned download save did not complete.', {
        ...result,
        recoveryCommands: ['file download-session-status', 'file download-session-cancel']
      })
    }
    printWorkspaceCommandResult(response, ctx.json, JSON.stringify)
  },
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
