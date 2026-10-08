import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError, RuntimeRpcFailureError } from '../runtime-client'
import {
  BrowserPaletteSelection,
  BrowserPaletteState
} from '../../shared/rpc-contract/browser-palette-params'
export const BROWSER_PALETTE_HANDLERS: Record<string, CommandHandler> = {
  'browser palette-select': async (ctx) => {
    if (ctx.client.isRemote || getRequiredStringFlag(ctx.flags, 'viewer') !== 'host') {
      throw new RuntimeClientError(
        'invalid_argument',
        'Palette controls require the local host viewer runtime.'
      )
    }
    const selection = BrowserPaletteSelection.safeParse({
      executionHostId: getRequiredStringFlag(ctx.flags, 'execution-host'),
      worktreeId: getRequiredStringFlag(ctx.flags, 'worktree'),
      workspaceId: getRequiredStringFlag(ctx.flags, 'workspace'),
      pageId: getRequiredStringFlag(ctx.flags, 'page')
    })
    if (!selection.success) {
      throw new RuntimeClientError('invalid_argument', 'Invalid Palette target.')
    }
    let response
    try {
      response = await ctx.client.call<{ applied: boolean; paletteState?: unknown }>(
        'ui.browserViewer',
        { viewer: 'host', operation: 'palette-select', selection: selection.data }
      )
    } catch (error) {
      if (
        error instanceof RuntimeRpcFailureError &&
        ['method_not_found', 'unknown_method', 'invalid_params'].includes(error.code)
      ) {
        throw new RuntimeClientError(
          'incompatible_runtime',
          'This runtime does not support Palette selection receipts.'
        )
      }
      throw error
    }
    const receipt = BrowserPaletteState.safeParse(response.result.paletteState)
    if (
      !response.result.applied ||
      !receipt.success ||
      receipt.data.pageId !== selection.data.pageId ||
      receipt.data.workspaceId !== selection.data.workspaceId ||
      receipt.data.worktreeId !== selection.data.worktreeId ||
      receipt.data.executionHostId !== selection.data.executionHostId
    ) {
      throw new RuntimeClientError(
        'runtime_error',
        'Palette selection did not return the exact owner receipt.'
      )
    }
    printResult(response, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
