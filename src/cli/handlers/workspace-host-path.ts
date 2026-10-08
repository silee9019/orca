import type { CommandHandler } from '../dispatch'
import {
  DesktopDirectoryCreate,
  DesktopHostPathExists
} from '../../shared/rpc-contract/workspace-host-path-params'
import { readWorkspaceCommandInput } from '../workspace-command-input'
import { printWorkspaceCommandResult } from '../workspace-command-result'

export const WORKSPACE_HOST_PATH_HANDLERS: Record<string, CommandHandler> = {
  'file mkdir-host-path': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopDirectoryCreate)
    const response = await ctx.client.call('files.createDesktopDirectory', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'file host-path-exists': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopHostPathExists)
    const response = await ctx.client.call('files.desktopPathExists', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  }
}
