import type { CommandHandler } from '../dispatch'
import {
  RemoteFolderDownloadStart,
  RemoteFolderDownloadRequest
} from '../../shared/rpc-contract/workspace-remote-folder-download-params'
import { readWorkspaceCommandInput, confirmWorkspaceCommand } from '../workspace-command-input'
import { printWorkspaceCommandResult } from '../workspace-command-result'
export const WORKSPACE_REMOTE_FOLDER_DOWNLOAD_HANDLERS: Record<string, CommandHandler> = {
  'file remote-folder-download-start': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, RemoteFolderDownloadStart)
    confirmWorkspaceCommand(ctx, params.destinationPath)
    const response = await ctx.client.call('files.remoteFolderDownloadStart', params)
    printWorkspaceCommandResult(response, ctx.json, JSON.stringify)
  },
  'file remote-folder-download-status': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, RemoteFolderDownloadRequest)
    const response = await ctx.client.call('files.remoteFolderDownloadStatus', params)
    printWorkspaceCommandResult(response, ctx.json, JSON.stringify)
  },
  'file remote-folder-download-cancel': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, RemoteFolderDownloadRequest)
    confirmWorkspaceCommand(ctx, params.requestId)
    const response = await ctx.client.call('files.remoteFolderDownloadCancel', params)
    printWorkspaceCommandResult(response, ctx.json, JSON.stringify)
  }
}
