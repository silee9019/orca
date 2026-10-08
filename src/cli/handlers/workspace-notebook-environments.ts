import type { CommandHandler } from '../dispatch'
import {
  NotebookEnvironmentList,
  NotebookPythonDescribe,
  NotebookVenvCreate,
  NotebookKernelInstall
} from '../../shared/rpc-contract/workspace-notebook-environment-params'
import { readWorkspaceCommandInput, confirmWorkspaceCommand } from '../workspace-command-input'
import { printWorkspaceCommandResult } from '../workspace-command-result'

export const WORKSPACE_NOTEBOOK_ENVIRONMENT_HANDLERS: Record<string, CommandHandler> = {
  'notebook environments': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, NotebookEnvironmentList)
    confirmWorkspaceCommand(ctx, params.filePath)
    const response = await ctx.client.call('notebook.listDesktopEnvironments', params, {
      timeoutMs: 30000
    })
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'notebook describe-python': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, NotebookPythonDescribe)
    confirmWorkspaceCommand(ctx, params.path)
    const response = await ctx.client.call('notebook.describeDesktopPython', params, {
      timeoutMs: 20000
    })
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'notebook create-venv': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, NotebookVenvCreate)
    confirmWorkspaceCommand(ctx, params.filePath)
    const response = await ctx.client.call('notebook.createDesktopVenv', params, {
      timeoutMs: 2100000
    })
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  },
  'notebook install-ipykernel': async (ctx) => {
    const params = await readWorkspaceCommandInput(ctx, NotebookKernelInstall)
    confirmWorkspaceCommand(ctx, params.python)
    const response = await ctx.client.call('notebook.installDesktopIpykernel', params, {
      timeoutMs: 2100000
    })
    printWorkspaceCommandResult(response, ctx.json, (value) => JSON.stringify(value))
  }
}
