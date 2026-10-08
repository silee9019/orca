import type { CommandHandler } from '../dispatch'
import {
  WorkspaceSpaceScanStart,
  WorkspaceSpaceScanRequest,
  WorkspaceSpaceScanResult
} from '../../shared/rpc-contract/workspace-space-scan-params'
import { readWorkspaceCommandInput, confirmWorkspaceCommand } from '../workspace-command-input'
import { printWorkspaceCommandResult } from '../workspace-command-result'
export const WORKSPACE_SPACE_SCAN_HANDLERS: Record<string, CommandHandler> = {
  'workspace-space scan-start': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, WorkspaceSpaceScanStart)
    confirmWorkspaceCommand(ctx, 'workspace-space-scan')
    const response = await ctx.client.call('workspaceSpace.scanStart', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'workspace-space scan-status': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, WorkspaceSpaceScanRequest)
    const response = await ctx.client.call('workspaceSpace.scanStatus', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'workspace-space scan-cancel': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, WorkspaceSpaceScanRequest)
    const response = await ctx.client.call('workspaceSpace.scanCancel', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'workspace-space scan-result': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, WorkspaceSpaceScanResult)
    const response = await ctx.client.call('workspaceSpace.scanResult', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  }
}
