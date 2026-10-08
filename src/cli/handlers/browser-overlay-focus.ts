import { z } from 'zod'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError, RuntimeRpcFailureError } from '../runtime-client'
import {
  BrowserOverlayFocusCommand,
  BrowserOverlayFocusState
} from '../../shared/rpc-contract/browser-overlay-focus-params'
const Receipt = z.object({ applied: z.literal(true), overlayFocus: BrowserOverlayFocusState })
export const BROWSER_OVERLAY_FOCUS_HANDLERS: Record<string, CommandHandler> = {
  'browser owning-group-focus': async (ctx) => {
    if (ctx.client.isRemote || getRequiredStringFlag(ctx.flags, 'viewer') !== 'host') {
      throw new RuntimeClientError(
        'invalid_argument',
        'Owning group focus requires the local host viewer.'
      )
    }
    const command = BrowserOverlayFocusCommand.parse({
      worktreeId: getRequiredStringFlag(ctx.flags, 'worktree'),
      workspaceId: getRequiredStringFlag(ctx.flags, 'workspace'),
      groupId: getRequiredStringFlag(ctx.flags, 'group'),
      executionHostId: getRequiredStringFlag(ctx.flags, 'execution-host')
    })
    let response
    try {
      response = await ctx.client.call<unknown>('ui.browserViewer', {
        viewer: 'host',
        operation: 'overlay-focus',
        command
      })
    } catch (error) {
      if (
        error instanceof RuntimeRpcFailureError &&
        ['method_not_found', 'unknown_method', 'invalid_params'].includes(error.code)
      ) {
        throw new RuntimeClientError(
          'incompatible_runtime',
          'This runtime does not support overlay focus owner receipts.'
        )
      }
      throw error
    }
    const receipt = Receipt.safeParse(response.result)
    if (
      !receipt.success ||
      Object.entries(command).some(
        ([key, value]) => Reflect.get(receipt.data.overlayFocus, key) !== value
      )
    ) {
      throw new RuntimeClientError(
        'runtime_error',
        'The exact owning group focus receipt is unavailable.'
      )
    }
    printResult(
      {
        id: response.id,
        ok: true,
        _meta: { runtimeId: response._meta.runtimeId },
        result: receipt.data
      },
      ctx.json,
      (value) => JSON.stringify(value, null, 2)
    )
  }
}
