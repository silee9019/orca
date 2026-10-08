import { z } from 'zod'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError, RuntimeRpcFailureError } from '../runtime-client'
import {
  ClientHostedBrowserRowCommand,
  ClientHostedBrowserRowState
} from '../../shared/rpc-contract/client-hosted-browser-row-params'
const perform =
  (action: 'activate' | 'close'): CommandHandler =>
  async (ctx) => {
    if (
      ctx.client.isRemote ||
      getRequiredStringFlag(ctx.flags, 'viewer') !== 'host' ||
      ctx.flags.get('confirm') !== true
    ) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Hosted row action requires the local host viewer and --confirm.'
      )
    }
    const command = ClientHostedBrowserRowCommand.parse({
      page: getRequiredStringFlag(ctx.flags, 'page'),
      worktreeId: getRequiredStringFlag(ctx.flags, 'worktree'),
      action,
      groupId: getRequiredStringFlag(ctx.flags, 'group'),
      expectedHostClientId: getRequiredStringFlag(ctx.flags, 'host-client')
    })
    let response
    try {
      response = await ctx.client.call<{
        applied: boolean
        page?: string
        clientHostedRow?: unknown
      }>('ui.browserViewer', { viewer: 'host', operation: 'client-hosted-row', command })
    } catch (error) {
      if (
        error instanceof RuntimeRpcFailureError &&
        ['method_not_found', 'unknown_method', 'invalid_params'].includes(error.code)
      ) {
        throw new RuntimeClientError(
          'incompatible_runtime',
          'This runtime does not support hosted-row receipts.'
        )
      }
      throw error
    }
    const result = z
      .object({
        applied: z.literal(true),
        page: z.string(),
        clientHostedRow: ClientHostedBrowserRowState
      })
      .safeParse(response.result)
    if (!result.success) {
      throw new RuntimeClientError(
        'runtime_error',
        'Hosted row action returned a malformed receipt.'
      )
    }
    const receipt = result.data.clientHostedRow
    if (
      result.data.page !== command.page ||
      receipt.page !== command.page ||
      receipt.worktreeId !== command.worktreeId ||
      receipt.expectedHostClientId !== command.expectedHostClientId ||
      receipt.groupId !== command.groupId ||
      receipt.action !== command.action
    ) {
      throw new RuntimeClientError(
        'runtime_error',
        'Hosted row action did not return the exact hosted row receipt.'
      )
    }
    printResult(
      {
        id: response.id,
        ok: true,
        _meta: { runtimeId: response._meta.runtimeId },
        result: { applied: true, page: command.page, clientHostedRow: receipt }
      },
      ctx.json,
      (value) => JSON.stringify(value, null, 2)
    )
  }
export const CLIENT_HOSTED_BROWSER_ROW_HANDLERS: Record<string, CommandHandler> = {
  'browser hosted-row activate': perform('activate'),
  'browser hosted-row close': perform('close')
}
