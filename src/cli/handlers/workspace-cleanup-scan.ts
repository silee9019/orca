import type { CommandHandler } from '../dispatch'
import {
  DesktopCleanupScanStart,
  DesktopCleanupScanRequest
} from '../../shared/rpc-contract/workspace-cleanup-scan-params'
import { readWorkspaceCommandInput, confirmWorkspaceCommand } from '../workspace-command-input'
import { printWorkspaceCommandResult } from '../workspace-command-result'
export const WORKSPACE_CLEANUP_SCAN_HANDLERS: Record<string, CommandHandler> = {
  'workspace-cleanup scan-start': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopCleanupScanStart)
    confirmWorkspaceCommand(ctx, 'workspace-cleanup-scan')
    const response = await ctx.client.call('workspaceCleanup.scanStart', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'workspace-cleanup scan-status': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopCleanupScanRequest)
    const response = await ctx.client.call('workspaceCleanup.scanStatus', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'workspace-cleanup scan-cancel': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopCleanupScanRequest)
    const response = await ctx.client.call('workspaceCleanup.scanCancel', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'workspace-cleanup scan-result': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopCleanupScanRequest)
    const response = await ctx.client.call('workspaceCleanup.scanResult', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  }
}
