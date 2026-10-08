import { z } from 'zod'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError, RuntimeRpcFailureError } from '../runtime-client'
import {
  BrowserEgressCommand,
  BrowserEgressState
} from '../../shared/rpc-contract/browser-egress-params'
const Receipt = z.object({ applied: z.literal(true), egress: BrowserEgressState })
function handler(action: BrowserEgressCommand['action']): CommandHandler {
  return async (ctx) => {
    if (ctx.client.isRemote || getRequiredStringFlag(ctx.flags, 'viewer') !== 'host') {
      throw new RuntimeClientError(
        'invalid_argument',
        'Browser egress commands require the local host viewer.'
      )
    }
    const kind = getRequiredStringFlag(ctx.flags, 'placement')
    const target =
      kind === 'ssh'
        ? {
            kind,
            executionHostId: getRequiredStringFlag(ctx.flags, 'execution-host'),
            egress: getRequiredStringFlag(ctx.flags, 'egress')
          }
        : kind === 'client'
          ? {
              kind,
              environmentId: getRequiredStringFlag(ctx.flags, 'runtime-environment'),
              clientTarget: {
                remotePageId: getRequiredStringFlag(ctx.flags, 'remote-page'),
                browserHostClientId: getRequiredStringFlag(ctx.flags, 'browser-host-client'),
                browserHostGeneration: Number(
                  getRequiredStringFlag(ctx.flags, 'browser-host-generation')
                ),
                pageHostGeneration: Number(getRequiredStringFlag(ctx.flags, 'page-host-generation'))
              }
            }
          : {
              kind,
              environmentId: getRequiredStringFlag(ctx.flags, 'runtime-environment'),
              remotePageId: getRequiredStringFlag(ctx.flags, 'remote-page')
            }
    const selected = BrowserEgressCommand.safeParse({
      action,
      page: getRequiredStringFlag(ctx.flags, 'page'),
      worktreeId: getRequiredStringFlag(ctx.flags, 'worktree'),
      target
    })
    if (!selected.success) {
      throw new RuntimeClientError('invalid_argument', 'Invalid exact egress target.')
    }
    const command = selected.data
    let response
    try {
      response = await ctx.client.call<unknown>('ui.browserViewer', {
        viewer: 'host',
        operation: 'egress',
        command
      })
    } catch (error) {
      if (
        error instanceof RuntimeRpcFailureError &&
        ['method_not_found', 'unknown_method', 'invalid_params'].includes(error.code)
      ) {
        throw new RuntimeClientError(
          'incompatible_runtime',
          'This runtime does not support mounted browser egress receipts.'
        )
      }
      throw error
    }
    const receipt = Receipt.safeParse(response.result)
    if (!receipt.success) {
      throw new RuntimeClientError('runtime_error', 'The browser egress receipt is malformed.')
    }
    const state = receipt.data.egress
    if (
      state.page !== command.page ||
      state.worktreeId !== command.worktreeId ||
      (action === 'open' && !state.open) ||
      (action === 'close' && state.open) ||
      (action === 'settings' && (!state.settingsOpened || state.open))
    ) {
      throw new RuntimeClientError(
        'runtime_error',
        'The exact browser egress effect was not acknowledged.'
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
export const BROWSER_EGRESS_HANDLERS: Record<string, CommandHandler> = {
  'browser egress open': handler('open'),
  'browser egress close': handler('close'),
  'browser egress settings': handler('settings'),
  'browser egress status': handler('status')
}
