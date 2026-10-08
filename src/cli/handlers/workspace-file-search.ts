import type { CommandHandler } from '../dispatch'
import {
  DesktopFileSearchStart,
  DesktopFileSearchRequest,
  DesktopFileSearchResult
} from '../../shared/rpc-contract/workspace-file-search-params'
import { readWorkspaceCommandInput } from '../workspace-command-input'
import { printWorkspaceCommandResult } from '../workspace-command-result'
export const WORKSPACE_FILE_SEARCH_HANDLERS: Record<string, CommandHandler> = {
  'file desktop-search-start': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopFileSearchStart)
    const response = await ctx.client.call('files.desktopSearchStart', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'file desktop-search-status': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopFileSearchRequest)
    const response = await ctx.client.call('files.desktopSearchStatus', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'file desktop-search-cancel': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopFileSearchRequest)
    const response = await ctx.client.call('files.desktopSearchCancel', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'file desktop-search-result': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopFileSearchResult)
    const response = await ctx.client.call('files.desktopSearchResult', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  }
}
