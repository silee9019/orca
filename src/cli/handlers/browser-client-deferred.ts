import {
  BrowserClientDeferredValue,
  BrowserClientDeferredReceipt,
  BrowserClientStagedTarget
} from '../../shared/rpc-contract/browser-client-deferred-params'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { RuntimeClientError } from '../runtime-client'
import { printResult } from '../format'
import type { BrowserViewerResult } from '../../shared/browser-viewer-command'
export const BROWSER_CLIENT_DEFERRED_HANDLERS: Record<string, CommandHandler> = {
  'browser client-defer': async (ctx) => {
    const viewer = getRequiredStringFlag(ctx.flags, 'viewer')
    const target = BrowserClientStagedTarget.safeParse({
      worktreeId: getRequiredStringFlag(ctx.flags, 'worktree'),
      page: getRequiredStringFlag(ctx.flags, 'page'),
      environmentId: getRequiredStringFlag(ctx.flags, 'runtime-environment'),
      remotePageId: getRequiredStringFlag(ctx.flags, 'remote-page')
    })
    const value = BrowserClientDeferredValue.safeParse(getRequiredStringFlag(ctx.flags, 'value'))
    if (viewer !== 'host' || !target.success || !value.success) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Specify the exact staged client page and a web address or search query.'
      )
    }
    const result = await ctx.client.call<BrowserViewerResult>('ui.browserViewer', {
      viewer,
      operation: 'client-deferred',
      entry: 'address-bar-staged',
      target: target.data,
      value: value.data
    })
    const acknowledgment = BrowserClientDeferredReceipt.safeParse(result.result?.clientDeferred)
    if (
      !result.result?.applied ||
      !acknowledgment.success ||
      Object.entries(target.data).some(
        ([key, value]) => Reflect.get(acknowledgment.data.target, key) !== value
      )
    ) {
      throw new RuntimeClientError(
        'runtime_error',
        'The exact staged viewer did not acknowledge its deferred queue write; later host adoption and loading are not observed.'
      )
    }
    printResult(
      {
        id: result.id,
        ok: true,
        _meta: { runtimeId: result._meta.runtimeId },
        result: { applied: true, page: target.data.page, clientDeferred: acknowledgment.data }
      },
      ctx.json,
      (value) => JSON.stringify(value, null, 2)
    )
  }
}
