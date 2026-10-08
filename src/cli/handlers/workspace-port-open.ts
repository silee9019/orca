import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError, RuntimeRpcFailureError } from '../runtime-client'
import {
  WorkspacePortOpenCommand,
  WorkspacePortOpenState
} from '../../shared/rpc-contract/workspace-port-open-params'
export const WORKSPACE_PORT_OPEN_HANDLERS: Record<string, CommandHandler> = {
  'browser port-open': async (ctx) => {
    if (ctx.client.isRemote || getRequiredStringFlag(ctx.flags, 'viewer') !== 'host') {
      throw new RuntimeClientError(
        'invalid_argument',
        'Port controls require the local host viewer runtime.'
      )
    }
    const selection = WorkspacePortOpenCommand.safeParse({
      executionHostId: getRequiredStringFlag(ctx.flags, 'execution-host'),
      worktreeId: getRequiredStringFlag(ctx.flags, 'worktree'),
      portId: getRequiredStringFlag(ctx.flags, 'port-id'),
      intent: getRequiredStringFlag(ctx.flags, 'intent')
    })
    if (!selection.success) {
      throw new RuntimeClientError('invalid_argument', 'Invalid Port target.')
    }
    let response
    try {
      response = await ctx.client.call<{ applied: boolean; portOpenState?: unknown }>(
        'ui.browserViewer',
        { viewer: 'host', operation: 'workspace-port-open', command: selection.data }
      )
    } catch (error) {
      if (
        error instanceof RuntimeRpcFailureError &&
        ['method_not_found', 'unknown_method', 'invalid_params'].includes(error.code)
      ) {
        throw new RuntimeClientError(
          'incompatible_runtime',
          'This runtime does not support Port selection receipts.'
        )
      }
      throw error
    }
    const receipt = WorkspacePortOpenState.safeParse(response.result.portOpenState)
    if (
      !response.result.applied ||
      !receipt.success ||
      receipt.data.portId !== selection.data.portId ||
      receipt.data.intent !== selection.data.intent ||
      receipt.data.worktreeId !== selection.data.worktreeId ||
      receipt.data.executionHostId !== selection.data.executionHostId
    ) {
      throw new RuntimeClientError(
        'runtime_error',
        'Port selection did not return the exact owner receipt.'
      )
    }
    printResult(response, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
