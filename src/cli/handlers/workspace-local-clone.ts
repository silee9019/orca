import type { CommandHandler } from '../dispatch'
import {
  DesktopLocalCloneStart,
  DesktopLocalCloneRequest,
  getDesktopLocalCloneConfirmation
} from '../../shared/rpc-contract/workspace-local-clone-params'
import { readWorkspaceCommandInput, confirmWorkspaceCommand } from '../workspace-command-input'
import { printWorkspaceCommandResult } from '../workspace-command-result'
export const WORKSPACE_LOCAL_CLONE_HANDLERS: Record<string, CommandHandler> = {
  'repo clone-desktop-local-start': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopLocalCloneStart)
    confirmWorkspaceCommand(ctx, getDesktopLocalCloneConfirmation(params))
    const response = await ctx.client.call('repo.desktopLocalCloneStart', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'repo clone-desktop-local-status': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopLocalCloneRequest)
    const response = await ctx.client.call('repo.desktopLocalCloneStatus', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'repo clone-desktop-local-cancel': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopLocalCloneRequest)
    const response = await ctx.client.call('repo.desktopLocalCloneCancel', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'repo clone-desktop-local-result': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopLocalCloneRequest)
    const response = await ctx.client.call('repo.desktopLocalCloneResult', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  }
}
