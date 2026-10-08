import type { CommandHandler } from '../dispatch'
import {
  DesktopNotebookKernelStart,
  DesktopNotebookKernelRequest,
  DesktopNotebookKernelExecute,
  DesktopNotebookKernelFrames,
  getDesktopNotebookKernelConfirmation
} from '../../shared/rpc-contract/workspace-notebook-kernel-params'
import { readWorkspaceCommandInput, confirmWorkspaceCommand } from '../workspace-command-input'
import { printWorkspaceCommandResult } from '../workspace-command-result'
export const WORKSPACE_NOTEBOOK_KERNEL_HANDLERS: Record<string, CommandHandler> = {
  'notebook kernel-start': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopNotebookKernelStart)
    confirmWorkspaceCommand(ctx, getDesktopNotebookKernelConfirmation(params))
    const response = await ctx.client.call('notebook.desktopKernelStart', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'notebook kernel-status': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopNotebookKernelRequest)
    const response = await ctx.client.call('notebook.desktopKernelStatus', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'notebook kernel-execute': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopNotebookKernelExecute)
    confirmWorkspaceCommand(ctx, params.requestId)
    const response = await ctx.client.call('notebook.desktopKernelExecute', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'notebook kernel-interrupt': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopNotebookKernelRequest)
    const response = await ctx.client.call('notebook.desktopKernelInterrupt', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'notebook kernel-shutdown': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopNotebookKernelRequest)
    const response = await ctx.client.call('notebook.desktopKernelShutdown', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'notebook kernel-frames': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, DesktopNotebookKernelFrames)
    const response = await ctx.client.call('notebook.desktopKernelFrames', params)
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  }
}
