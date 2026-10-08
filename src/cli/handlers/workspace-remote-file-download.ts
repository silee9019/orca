import type { CommandHandler } from '../dispatch'
import {
  RemoteFileDownloadStart,
  RemoteFileDownloadRequest
} from '../../shared/rpc-contract/workspace-remote-file-download-params'
import { readWorkspaceCommandInput, confirmWorkspaceCommand } from '../workspace-command-input'
import { printWorkspaceCommandResult } from '../workspace-command-result'
export const WORKSPACE_REMOTE_FILE_DOWNLOAD_HANDLERS: Record<string, CommandHandler> = {
  'file remote-file-download-start': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, RemoteFileDownloadStart)
    confirmWorkspaceCommand(ctx, params.destinationPath)
    const response = await ctx.client.call('files.remoteFileDownloadStart', params)
    printWorkspaceCommandResult(response, ctx.json, JSON.stringify)
  },
  'file remote-file-download-status': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, RemoteFileDownloadRequest)
    const response = await ctx.client.call('files.remoteFileDownloadStatus', params)
    printWorkspaceCommandResult(response, ctx.json, JSON.stringify)
  },
  'file remote-file-download-cancel': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, RemoteFileDownloadRequest)
    confirmWorkspaceCommand(ctx, params.requestId)
    const response = await ctx.client.call('files.remoteFileDownloadCancel', params)
    printWorkspaceCommandResult(response, ctx.json, JSON.stringify)
  }
}
