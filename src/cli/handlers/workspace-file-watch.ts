import type { CommandHandler } from '../dispatch'
import { readWorkspaceCommandInput } from '../workspace-command-input'
import { printWorkspaceCommandResult } from '../workspace-command-result'
import {
  CliFileWatchStart,
  CliFileWatchRequest,
  CliFileWatchStatus
} from '../../shared/rpc-contract/workspace-file-watch-params'
export const WORKSPACE_FILE_WATCH_HANDLERS: Record<string, CommandHandler> = {
  'file watch-start': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, CliFileWatchStart)
    printWorkspaceCommandResult(
      await ctx.client.call('files.cliWatchStart', params),
      ctx.json,
      JSON.stringify
    )
  },
  'file watch-status': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, CliFileWatchStatus)
    printWorkspaceCommandResult(
      await ctx.client.call('files.cliWatchStatus', params),
      ctx.json,
      JSON.stringify
    )
  },
  'file watch-stop': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, CliFileWatchRequest)
    printWorkspaceCommandResult(
      await ctx.client.call('files.cliWatchStop', params),
      ctx.json,
      JSON.stringify
    )
  }
}
