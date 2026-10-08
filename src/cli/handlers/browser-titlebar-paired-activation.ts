import { z } from 'zod'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError, RuntimeRpcFailureError } from '../runtime-client'
import {
  BrowserTitlebarPairedActivationTarget,
  BrowserTitlebarPairedActivationState
} from '../../shared/rpc-contract/browser-titlebar-paired-activation-params'
const Receipt = z.object({
  applied: z.literal(true),
  titlebarPairedActivation: BrowserTitlebarPairedActivationState
})
export const BROWSER_TITLEBAR_PAIRED_ACTIVATION_HANDLERS: Record<string, CommandHandler> = {
  'browser titlebar-activate-paired': async (ctx) => {
    if (ctx.client.isRemote || getRequiredStringFlag(ctx.flags, 'viewer') !== 'host') {
      throw new RuntimeClientError(
        'invalid_argument',
        'Paired titlebar activation requires the local host viewer.'
      )
    }
    const kind = getRequiredStringFlag(ctx.flags, 'placement')
    const selected = BrowserTitlebarPairedActivationTarget.safeParse({
      worktree: getRequiredStringFlag(ctx.flags, 'worktree'),
      group: getRequiredStringFlag(ctx.flags, 'group'),
      workspace: getRequiredStringFlag(ctx.flags, 'workspace'),
      unifiedTab: getRequiredStringFlag(ctx.flags, 'unified-tab'),
      page: getRequiredStringFlag(ctx.flags, 'page'),
      remotePageId: getRequiredStringFlag(ctx.flags, 'remote-page'),
      hostTabId: getRequiredStringFlag(ctx.flags, 'host-tab'),
      environmentId: getRequiredStringFlag(ctx.flags, 'runtime-environment'),
      executionHostId: getRequiredStringFlag(ctx.flags, 'execution-host'),
      pairingRevision: Number(getRequiredStringFlag(ctx.flags, 'pairing-revision')),
      placement:
        kind === 'client'
          ? {
              kind,
              browserHostClientId: getRequiredStringFlag(ctx.flags, 'browser-host-client'),
              browserHostGeneration: Number(
                getRequiredStringFlag(ctx.flags, 'browser-host-generation')
              ),
              pageHostGeneration: Number(getRequiredStringFlag(ctx.flags, 'page-host-generation'))
            }
          : { kind }
    })
    if (
      !selected.success ||
      selected.data.executionHostId !== `runtime:${selected.data.environmentId}`
    ) {
      throw new RuntimeClientError('invalid_argument', 'Invalid exact paired titlebar target.')
    }
    const target = selected.data
    let response
    try {
      response = await ctx.client.call<unknown>('ui.browserViewer', {
        viewer: 'host',
        operation: 'titlebar-activate-paired',
        target
      })
    } catch (error) {
      if (
        error instanceof RuntimeRpcFailureError &&
        ['method_not_found', 'unknown_method', 'invalid_params'].includes(error.code)
      ) {
        throw new RuntimeClientError(
          'incompatible_runtime',
          'This runtime does not support paired titlebar activation receipts.'
        )
      }
      throw error
    }
    const receipt = Receipt.safeParse(response?.result)
    if (
      !receipt.success ||
      JSON.stringify(receipt.data.titlebarPairedActivation.target) !== JSON.stringify(target) ||
      receipt.data.titlebarPairedActivation.activeGroup !== target.group ||
      receipt.data.titlebarPairedActivation.activeWorkspace !== target.workspace ||
      receipt.data.titlebarPairedActivation.activeTab !== target.unifiedTab
    ) {
      throw new RuntimeClientError(
        'runtime_error',
        'The exact paired titlebar selection was not acknowledged.'
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
