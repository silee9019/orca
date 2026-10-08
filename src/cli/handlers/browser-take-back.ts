import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError, RuntimeRpcFailureError } from '../runtime-client'
import {
  BrowserTakeBackCommand,
  BrowserTakeBackState
} from '../../shared/rpc-contract/browser-take-back-params'
export const BROWSER_TAKE_BACK_HANDLERS: Record<string, CommandHandler> = {
  'browser take-back': async (ctx) => {
    if (
      ctx.client.isRemote ||
      getRequiredStringFlag(ctx.flags, 'viewer') !== 'host' ||
      ctx.flags.get('confirm') !== true
    ) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Take back requires the local host viewer and --confirm.'
      )
    }
    const command = BrowserTakeBackCommand.parse({
      page: getRequiredStringFlag(ctx.flags, 'page'),
      worktreeId: getRequiredStringFlag(ctx.flags, 'worktree'),
      expectedMobileClientId: getRequiredStringFlag(ctx.flags, 'mobile-client')
    })
    let response
    try {
      response = await ctx.client.call<{ applied: boolean; page?: string; takeBack?: unknown }>(
        'ui.browserViewer',
        { viewer: 'host', operation: 'take-back', command }
      )
    } catch (error) {
      if (
        error instanceof RuntimeRpcFailureError &&
        ['method_not_found', 'unknown_method', 'invalid_params'].includes(error.code)
      ) {
        throw new RuntimeClientError(
          'incompatible_runtime',
          'This runtime does not support browser take-back receipts.'
        )
      }
      throw error
    }
    const receipt = BrowserTakeBackState.safeParse(response.result.takeBack)
    if (
      !response.result.applied ||
      response.result.page !== command.page ||
      !receipt.success ||
      receipt.data.page !== command.page ||
      receipt.data.worktreeId !== command.worktreeId ||
      receipt.data.expectedMobileClientId !== command.expectedMobileClientId
    ) {
      throw new RuntimeClientError(
        'runtime_error',
        'Take back did not return the exact desktop driver receipt.'
      )
    }
    printResult(
      {
        id: response.id,
        ok: true,
        _meta: { runtimeId: response._meta.runtimeId },
        result: { applied: true, page: command.page, takeBack: receipt.data }
      },
      ctx.json,
      (value) => JSON.stringify(value, null, 2)
    )
  }
}
