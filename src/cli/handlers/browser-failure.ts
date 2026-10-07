import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError, RuntimeRpcFailureError } from '../runtime-client'
import {
  BrowserFailureTarget,
  BrowserFailureState
} from '../../shared/rpc-contract/browser-failure-params'
export const BROWSER_FAILURE_HANDLERS: Record<string, CommandHandler> = {
  'browser failure': async (ctx) => {
    if (ctx.client.isRemote || getRequiredStringFlag(ctx.flags, 'viewer') !== 'host') {
      throw new RuntimeClientError(
        'invalid_argument',
        'Failure controls require the local host viewer runtime.'
      )
    }
    const selection = BrowserFailureTarget.safeParse({
      clientTarget: ctx.flags.has('remote-page')
        ? {
            remotePageId: getRequiredStringFlag(ctx.flags, 'remote-page'),
            browserHostClientId: getRequiredStringFlag(ctx.flags, 'browser-host-client'),
            browserHostGeneration: Number(
              getRequiredStringFlag(ctx.flags, 'browser-host-generation')
            ),
            pageHostGeneration: Number(getRequiredStringFlag(ctx.flags, 'page-host-generation'))
          }
        : undefined,
      worktreeId: getRequiredStringFlag(ctx.flags, 'worktree'),
      placement: getRequiredStringFlag(ctx.flags, 'placement'),
      environmentId:
        typeof ctx.flags.get('runtime-environment') === 'string'
          ? ctx.flags.get('runtime-environment')
          : null,
      expectedUrl: getRequiredStringFlag(ctx.flags, 'url'),
      errorCode: Number(getRequiredStringFlag(ctx.flags, 'error-code')),
      action: getRequiredStringFlag(ctx.flags, 'action'),
      challengeId:
        typeof ctx.flags.get('challenge') === 'string' ? ctx.flags.get('challenge') : undefined
    })
    if (!selection.success) {
      throw new RuntimeClientError('invalid_argument', 'Invalid failure target.')
    }
    if (
      (selection.data.placement === 'client-hosted') !== (selection.data.environmentId !== null) ||
      (selection.data.placement === 'client-hosted') !== Boolean(selection.data.clientTarget)
    ) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Client-hosted failure controls require the exact materialized client target.'
      )
    }
    if (selection.data.action === 'certificate-proceed' && ctx.flags.get('confirm') !== true) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Pass --confirm to approve this certificate.'
      )
    }
    let response
    try {
      response = await ctx.client.call<{ applied: boolean; page?: string; failureState?: unknown }>(
        'ui.browserViewer',
        {
          viewer: 'host',
          operation: 'load-failure',
          page: getRequiredStringFlag(ctx.flags, 'page'),
          command: selection.data
        }
      )
    } catch (error) {
      if (
        error instanceof RuntimeRpcFailureError &&
        ['method_not_found', 'unknown_method', 'invalid_params'].includes(error.code)
      ) {
        throw new RuntimeClientError(
          'incompatible_runtime',
          'This runtime does not support Failure control receipts.'
        )
      }
      throw error
    }
    const receipt = BrowserFailureState.safeParse(response.result.failureState)
    if (
      !response.result.applied ||
      response.result.page !== getRequiredStringFlag(ctx.flags, 'page') ||
      !receipt.success ||
      JSON.stringify(receipt.data) !== JSON.stringify({ ...selection.data, accepted: true })
    ) {
      throw new RuntimeClientError(
        'runtime_error',
        'Failure control did not return the exact owner receipt.'
      )
    }
    printResult(response, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
