import type { CommandHandler } from '../dispatch'
import {
  DesktopLogTailRead,
  DesktopLogTailStart,
  DesktopLogTailRequest
} from '../../shared/rpc-contract/workspace-log-tail-params'
import { readWorkspaceCommandInput } from '../workspace-command-input'
import { printWorkspaceCommandResult } from '../workspace-command-result'
export const WORKSPACE_LOG_TAIL_HANDLERS: Record<string, CommandHandler> = {
  'file log-tail-read': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopLogTailRead)
    const response = await ctx.client.call('files.desktopLogTailRead', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'file log-tail-start': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopLogTailStart)
    const response = await ctx.client.call('files.desktopLogTailStart', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'file log-tail-status': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopLogTailRequest)
    const response = await ctx.client.call('files.desktopLogTailStatus', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'file log-tail-stop': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopLogTailRequest)
    const response = await ctx.client.call('files.desktopLogTailStop', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  }
}
