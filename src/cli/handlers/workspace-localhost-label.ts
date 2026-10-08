import type { CommandHandler } from '../dispatch'
import { DesktopLocalhostLabel } from '../../shared/rpc-contract/workspace-localhost-label-params'
import { readWorkspaceCommandInput, confirmWorkspaceCommand } from '../workspace-command-input'
import { printWorkspaceCommandResult } from '../workspace-command-result'
export const WORKSPACE_LOCALHOST_LABEL_HANDLERS: Record<string, CommandHandler> = {
  'workspace-ports register-localhost-label': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopLocalhostLabel)
    confirmWorkspaceCommand(ctx, params.targetUrl)
    const response = await ctx.client.call('workspacePorts.registerDesktopLocalhostLabel', params, {
      timeoutMs: 120000
    })
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  }
}
