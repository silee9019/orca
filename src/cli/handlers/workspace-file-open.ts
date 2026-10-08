import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError, RuntimeRpcFailureError } from '../runtime-client'
import {
  WorkspaceFileOpenCommand,
  WorkspaceFileOpenState
} from '../../shared/rpc-contract/workspace-file-open-params'
export const WORKSPACE_FILE_OPEN_HANDLERS: Record<string, CommandHandler> = {
  'browser file-open': async (ctx) => {
    if (ctx.client.isRemote || getRequiredStringFlag(ctx.flags, 'viewer') !== 'host') {
      throw new RuntimeClientError(
        'invalid_argument',
        'File controls require the local host viewer runtime.'
      )
    }
    const selection = WorkspaceFileOpenCommand.safeParse({
      executionHostId: getRequiredStringFlag(ctx.flags, 'execution-host'),
      worktreeId: getRequiredStringFlag(ctx.flags, 'worktree'),
      filePath: getRequiredStringFlag(ctx.flags, 'file')
    })
    if (!selection.success) {
      throw new RuntimeClientError('invalid_argument', 'Invalid File target.')
    }
    let response
    try {
      response = await ctx.client.call<{ applied: boolean; fileOpenState?: unknown }>(
        'ui.browserViewer',
        { viewer: 'host', operation: 'workspace-file-open', command: selection.data }
      )
    } catch (error) {
      if (
        error instanceof RuntimeRpcFailureError &&
        ['method_not_found', 'unknown_method', 'invalid_params'].includes(error.code)
      ) {
        throw new RuntimeClientError(
          'incompatible_runtime',
          'This runtime does not support File selection receipts.'
        )
      }
      throw error
    }
    const receipt = WorkspaceFileOpenState.safeParse(response.result.fileOpenState)
    if (
      !response.result.applied ||
      !receipt.success ||
      receipt.data.filePath !== selection.data.filePath ||
      receipt.data.worktreeId !== selection.data.worktreeId ||
      receipt.data.executionHostId !== selection.data.executionHostId
    ) {
      throw new RuntimeClientError(
        'runtime_error',
        'File selection did not return the exact owner receipt.'
      )
    }
    printResult(response, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
