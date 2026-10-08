import type { CommandHandler } from '../dispatch'
import {
  DesktopGitStatusStart,
  DesktopGitStatusRequest,
  DesktopGitStatusResult
} from '../../shared/rpc-contract/workspace-git-status-params'
import { readWorkspaceCommandInput } from '../workspace-command-input'
import { printWorkspaceCommandResult } from '../workspace-command-result'
export const WORKSPACE_GIT_STATUS_HANDLERS: Record<string, CommandHandler> = {
  'git desktop-status-start': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopGitStatusStart)
    const response = await ctx.client.call('git.desktopStatusStart', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'git desktop-status-status': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopGitStatusRequest)
    const response = await ctx.client.call('git.desktopStatusStatus', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'git desktop-status-cancel': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopGitStatusRequest)
    const response = await ctx.client.call('git.desktopStatusCancel', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'git desktop-status-result': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopGitStatusResult)
    const response = await ctx.client.call('git.desktopStatusResult', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  }
}
