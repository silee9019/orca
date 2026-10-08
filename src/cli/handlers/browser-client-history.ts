import { z } from 'zod'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { RuntimeClientError, RuntimeRpcFailureError } from '../runtime-client'
import { printResult } from '../format'
import { readBrowserClientTargetFlags } from './browser-client-target-flags'
import {
  BrowserClientHistoryViewerCommand,
  BrowserClientHistoryReceipt
} from '../../shared/rpc-contract/browser-client-history-params'
const Receipt = z.object({ applied: z.literal(true), clientHistory: BrowserClientHistoryReceipt })
export const BROWSER_CLIENT_HISTORY_HANDLERS: Record<string, CommandHandler> = {
  'browser client-history': async (ctx) => {
    const command = BrowserClientHistoryViewerCommand.safeParse({
      viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
      operation: 'client-history',
      target: readBrowserClientTargetFlags(ctx.flags),
      action: getRequiredStringFlag(ctx.flags, 'action')
    })
    if (!command.success) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Specify an exact client-hosted page, host viewer and history direction.'
      )
    }
    let response
    try {
      response = await ctx.client.call<unknown>('ui.browserViewer', command.data)
    } catch (error) {
      if (
        error instanceof RuntimeRpcFailureError &&
        ['method_not_found', 'unknown_method', 'invalid_params'].includes(error.code)
      ) {
        throw new RuntimeClientError(
          'incompatible_runtime',
          'This viewer does not support client guest history receipts.'
        )
      }
      throw error
    }
    const receipt = Receipt.safeParse(response?.result)
    if (
      !receipt.success ||
      receipt.data.clientHistory.action !== command.data.action ||
      Object.entries(command.data.target).some(
        ([key, value]) => Reflect.get(receipt.data.clientHistory.target, key) !== value
      )
    ) {
      throw new RuntimeClientError(
        'runtime_error',
        'The exact guest history receipt is malformed or unavailable.'
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
