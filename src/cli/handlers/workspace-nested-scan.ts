import type { CommandHandler } from '../dispatch'
import {
  DesktopNestedScanStart,
  DesktopNestedScanRequest,
  DesktopNestedScanResult
} from '../../shared/rpc-contract/workspace-nested-scan-params'
import { readWorkspaceCommandInput } from '../workspace-command-input'
import { printWorkspaceCommandResult } from '../workspace-command-result'
export const WORKSPACE_NESTED_SCAN_HANDLERS: Record<string, CommandHandler> = {
  'project-group desktop-scan-start': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopNestedScanStart)
    const response = await ctx.client.call('projectGroups.desktopScanStart', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'project-group desktop-scan-status': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopNestedScanRequest)
    const response = await ctx.client.call('projectGroups.desktopScanStatus', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'project-group desktop-scan-cancel': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopNestedScanRequest)
    const response = await ctx.client.call('projectGroups.desktopScanCancel', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'project-group desktop-scan-result': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopNestedScanResult)
    const response = await ctx.client.call('projectGroups.desktopScanResult', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  }
}
