import { z } from 'zod'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError, RuntimeRpcFailureError } from '../runtime-client'
import {
  BrowserBannerCommand,
  BrowserBannerState
} from '../../shared/rpc-contract/browser-banner-params'
const Receipt = z.object({ applied: z.literal(true), banner: BrowserBannerState })
function handler(action: BrowserBannerCommand['action']): CommandHandler {
  return async (ctx) => {
    if (ctx.client.isRemote || getRequiredStringFlag(ctx.flags, 'viewer') !== 'host') {
      throw new RuntimeClientError(
        'invalid_argument',
        'Browser banner commands require the local host viewer.'
      )
    }
    const command = BrowserBannerCommand.parse({
      action,
      page: getRequiredStringFlag(ctx.flags, 'page'),
      worktreeId: getRequiredStringFlag(ctx.flags, 'worktree')
    })
    let response
    try {
      response = await ctx.client.call<unknown>('ui.browserViewer', {
        viewer: 'host',
        operation: 'banner',
        command
      })
    } catch (error) {
      if (
        error instanceof RuntimeRpcFailureError &&
        ['method_not_found', 'unknown_method', 'invalid_params'].includes(error.code)
      ) {
        throw new RuntimeClientError(
          'incompatible_runtime',
          'This runtime does not support mounted browser banner receipts.'
        )
      }
      throw error
    }
    const receipt = Receipt.safeParse(response.result)
    if (!receipt.success) {
      throw new RuntimeClientError('runtime_error', 'The browser banner receipt is malformed.')
    }
    const state = receipt.data.banner
    if (
      state.page !== command.page ||
      state.worktreeId !== command.worktreeId ||
      (action === 'resource-dismiss' && state.hasResourceNotice) ||
      (action === 'cancel-grab' &&
        (state.hasPendingAnnotation ||
          state.grabState !== 'idle' ||
          state.cancellationAccepted !== true)) ||
      (action === 'send-menu-open' && !state.sendMenuOpen) ||
      (action === 'send-menu-close' && state.sendMenuOpen)
    ) {
      throw new RuntimeClientError(
        'runtime_error',
        'The exact browser banner effect was not acknowledged.'
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
export const BROWSER_BANNER_HANDLERS: Record<string, CommandHandler> = {
  'browser banner resource-dismiss': handler('resource-dismiss'),
  'browser banner cancel-grab': handler('cancel-grab'),
  'browser banner send-menu-open': handler('send-menu-open'),
  'browser banner send-menu-close': handler('send-menu-close'),
  'browser banner status': handler('status')
}
