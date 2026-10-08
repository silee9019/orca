import { z } from 'zod'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError, RuntimeRpcFailureError } from '../runtime-client'
import {
  BrowserGrabToastCommand,
  BrowserGrabToastState
} from '../../shared/rpc-contract/browser-grab-toast-params'
const Receipt = z.object({ applied: z.literal(true), grabToast: BrowserGrabToastState })
function handler(action: 'status' | 'copy'): CommandHandler {
  return async (ctx) => {
    if (ctx.client.isRemote || getRequiredStringFlag(ctx.flags, 'viewer') !== 'host') {
      throw new RuntimeClientError(
        'invalid_argument',
        'Grab toast commands require the local host viewer.'
      )
    }
    const selected = BrowserGrabToastCommand.safeParse({
      action,
      page: getRequiredStringFlag(ctx.flags, 'page'),
      worktreeId: getRequiredStringFlag(ctx.flags, 'worktree'),
      workspaceId: getRequiredStringFlag(ctx.flags, 'workspace'),
      groupId: getRequiredStringFlag(ctx.flags, 'group'),
      executionHostId: getRequiredStringFlag(ctx.flags, 'execution-host'),
      ...(action === 'copy' ? { toastId: getRequiredStringFlag(ctx.flags, 'toast') } : {})
    })
    if (!selected.success) {
      throw new RuntimeClientError('invalid_argument', 'Invalid exact grab toast target.')
    }
    const command = selected.data
    let response
    try {
      response = await ctx.client.call<unknown>('ui.browserViewer', {
        viewer: 'host',
        operation: 'grab-toast',
        command
      })
    } catch (error) {
      if (
        error instanceof RuntimeRpcFailureError &&
        ['method_not_found', 'unknown_method', 'invalid_params'].includes(error.code)
      ) {
        throw new RuntimeClientError(
          'incompatible_runtime',
          'This runtime does not support retained grab toast receipts.'
        )
      }
      throw error
    }
    const receipt = Receipt.safeParse(response?.result)
    if (
      !receipt.success ||
      Object.entries(command).some(
        ([key, value]) => key !== 'action' && Reflect.get(receipt.data.grabToast, key) !== value
      ) ||
      (action === 'copy' && !receipt.data.grabToast.copied)
    ) {
      throw new RuntimeClientError(
        'runtime_error',
        'The exact grab toast receipt is malformed or unavailable.'
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
export const BROWSER_GRAB_TOAST_HANDLERS: Record<string, CommandHandler> = {
  'browser grab-toast status': handler('status'),
  'browser grab-toast copy': handler('copy')
}
