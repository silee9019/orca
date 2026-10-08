import type { CommandHandler } from '../dispatch'
import { printWorkspaceCommandResult } from '../workspace-command-result'
import { readWorkspaceCommandInput, confirmWorkspaceCommand } from '../workspace-command-input'
import {
  WorkspacePortKillParams,
  WorkspacePortScanParams
} from '../../shared/rpc-contract/workspace-ports-params'

export const WORKSPACE_PORTS_HANDLERS: Record<string, CommandHandler> = {
  'workspace-ports scan': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, WorkspacePortScanParams)
    const result = await ctx.client.call('workspacePorts.scan', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  },
  'workspace-ports kill': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, WorkspacePortKillParams)
    confirmWorkspaceCommand(ctx, `${params.pid}:${params.port}`)
    const result = await ctx.client.call('workspacePorts.kill', params)
    printWorkspaceCommandResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
