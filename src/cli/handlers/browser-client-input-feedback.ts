import { z } from 'zod'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag, getRequiredStringFlagAllowingEmpty } from '../flags'
import { RuntimeClientError, RuntimeRpcFailureError } from '../runtime-client'
import { printResult } from '../format'
import { readBrowserClientTargetFlags } from './browser-client-target-flags'
import {
  BrowserClientInputFeedbackCommand,
  BrowserClientInputFeedbackState
} from '../../shared/rpc-contract/browser-client-input-feedback-params'
const Receipt = z.object({
  applied: z.literal(true),
  clientInputFeedback: BrowserClientInputFeedbackState
})
export const BROWSER_CLIENT_INPUT_FEEDBACK_HANDLERS: Record<string, CommandHandler> = {
  'browser client-input-feedback': async (ctx) => {
    const sourceKind = ctx.flags.get('source-kind') ?? 'materialized'
    const target =
      sourceKind === 'staged'
        ? {
            worktreeId: getRequiredStringFlag(ctx.flags, 'worktree'),
            page: getRequiredStringFlag(ctx.flags, 'page'),
            environmentId: getRequiredStringFlag(ctx.flags, 'runtime-environment'),
            remotePageId: getRequiredStringFlag(ctx.flags, 'remote-page')
          }
        : readBrowserClientTargetFlags(ctx.flags)
    const command = BrowserClientInputFeedbackCommand.safeParse({
      viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
      operation: 'client-input-feedback',
      source: { kind: sourceKind, target },
      value: getRequiredStringFlagAllowingEmpty(ctx.flags, 'value')
    })
    if (ctx.client.isRemote || !command.success) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Specify an exact client-hosted page, host viewer and rejected input.'
      )
    }
    let response
    try {
      response = await ctx.client.call<unknown>('ui.browserViewer', command.data)
    } catch (error) {
      if (
        error instanceof RuntimeRpcFailureError &&
        ['method_not_found', 'unknown_method', 'invalid_params', 'invalid_argument'].includes(
          error.code
        )
      ) {
        throw new RuntimeClientError(
          'incompatible_runtime',
          'This viewer does not support client input rejection feedback receipts.'
        )
      }
      throw error
    }
    const receipt = Receipt.safeParse(response?.result)
    if (
      !receipt.success ||
      receipt.data.clientInputFeedback.source.kind !== command.data.source.kind ||
      Object.entries(command.data.source.target).some(
        ([key, value]) => Reflect.get(receipt.data.clientInputFeedback.source.target, key) !== value
      )
    ) {
      throw new RuntimeClientError(
        'runtime_error',
        'The exact input rejection feedback receipt is malformed or unavailable.'
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
