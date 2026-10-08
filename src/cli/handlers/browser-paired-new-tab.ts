import { z } from 'zod'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError, RuntimeRpcFailureError } from '../runtime-client'
import {
  BrowserPairedNewTabTarget,
  BrowserPairedNewTabState
} from '../../shared/rpc-contract/browser-paired-new-tab-params'
const Receipt = z.object({ applied: z.literal(true), pairedNewTab: BrowserPairedNewTabState })
export const BROWSER_PAIRED_NEW_TAB_HANDLERS: Record<string, CommandHandler> = {
  'browser new-ui-paired': async (ctx) => {
    if (
      ctx.client.isRemote ||
      getRequiredStringFlag(ctx.flags, 'viewer') !== 'host' ||
      ctx.flags.get('confirm') !== true
    ) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Paired browser creation requires the local host viewer and --confirm.'
      )
    }
    const selected = BrowserPairedNewTabTarget.safeParse({
      worktree: getRequiredStringFlag(ctx.flags, 'worktree'),
      ...(ctx.flags.has('group') ? { group: getRequiredStringFlag(ctx.flags, 'group') } : {}),
      environmentId: getRequiredStringFlag(ctx.flags, 'runtime-environment'),
      executionHostId: getRequiredStringFlag(ctx.flags, 'execution-host'),
      pairingRevision: Number(getRequiredStringFlag(ctx.flags, 'pairing-revision'))
    })
    if (
      !selected.success ||
      selected.data.executionHostId !== `runtime:${selected.data.environmentId}`
    ) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Invalid exact paired browser creation target.'
      )
    }
    const target = selected.data
    let response
    try {
      response = await ctx.client.call<unknown>('ui.browserViewer', {
        viewer: 'host',
        operation: 'new-tab-paired',
        target
      })
    } catch (error) {
      if (
        error instanceof RuntimeRpcFailureError &&
        ['method_not_found', 'unknown_method', 'invalid_params'].includes(error.code)
      ) {
        throw new RuntimeClientError(
          'incompatible_runtime',
          'This runtime does not support paired browser creation owner receipts.'
        )
      }
      throw error
    }
    const receipt = Receipt.safeParse(response?.result)
    if (
      !receipt.success ||
      Object.entries(target).some(
        ([key, value]) => Reflect.get(receipt.data.pairedNewTab.target, key) !== value
      ) ||
      receipt.data.pairedNewTab.target.group !== target.group
    ) {
      throw new RuntimeClientError(
        'runtime_error',
        'The exact paired browser creation was not acknowledged.'
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
