import type { CommandHandler } from '../dispatch'
import {
  DesktopRemoteCloneStart,
  DesktopRemoteCloneRequest,
  getDesktopRemoteCloneConfirmation
} from '../../shared/rpc-contract/workspace-remote-clone-params'
import { readWorkspaceCommandInput, confirmWorkspaceCommand } from '../workspace-command-input'
import { printWorkspaceCommandResult } from '../workspace-command-result'
export const WORKSPACE_REMOTE_CLONE_HANDLERS: Record<string, CommandHandler> = {
  'repo clone-desktop-remote-start': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopRemoteCloneStart)
    confirmWorkspaceCommand(ctx, getDesktopRemoteCloneConfirmation(params))
    const response = await ctx.client.call('repo.desktopRemoteCloneStart', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'repo clone-desktop-remote-status': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopRemoteCloneRequest)
    const response = await ctx.client.call('repo.desktopRemoteCloneStatus', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'repo clone-desktop-remote-cancel': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopRemoteCloneRequest)
    const response = await ctx.client.call('repo.desktopRemoteCloneCancel', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'repo clone-desktop-remote-result': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopRemoteCloneRequest)
    const response = await ctx.client.call('repo.desktopRemoteCloneResult', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  }
}
