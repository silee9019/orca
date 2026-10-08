import type { CommandHandler } from '../dispatch'
import { printWorkspaceCommandResult } from '../workspace-command-result'
import { readWorkspaceCommandInput, confirmWorkspaceCommand } from '../workspace-command-input'
import {
  FolderWorkspaceCreate,
  FolderWorkspaceUpdate,
  FolderWorkspaceSelector,
  FolderWorkspacePathStatus
} from '../../shared/rpc-contract/folder-workspace-params'

export const WORKSPACE_FOLDER_HANDLERS: Record<string, CommandHandler> = {
  'folder-workspace list': async (ctx) => {
    const result = await ctx.client.call('folderWorkspace.list')
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'folder-workspace create': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, FolderWorkspaceCreate)
    const result = await ctx.client.call('folderWorkspace.create', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'folder-workspace update': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, FolderWorkspaceUpdate)
    const result = await ctx.client.call('folderWorkspace.update', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'folder-workspace delete': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, FolderWorkspaceSelector)
    confirmWorkspaceCommand(ctx, params.folderWorkspaceId)
    const result = await ctx.client.call('folderWorkspace.delete', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'folder-workspace path-status': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, FolderWorkspacePathStatus)
    const result = await ctx.client.call('folderWorkspace.getPathStatus', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
