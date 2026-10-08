import { readBrowserClientTargetFlags } from './browser-client-target-flags'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { RuntimeClientError } from '../runtime-client'
import { printResult } from '../format'
import {
  BrowserClientMarkupTarget,
  BrowserClientMarkupAction,
  BrowserClientMarkupReceipt
} from '../../shared/rpc-contract/browser-client-markup-params'
import type { BrowserViewerResult } from '../../shared/browser-viewer-command'
export const BROWSER_CLIENT_MARKUP_HANDLERS: Record<string, CommandHandler> = {
  'browser client-markup': async (ctx) => {
    const viewer = getRequiredStringFlag(ctx.flags, 'viewer')
    const target = BrowserClientMarkupTarget.safeParse(readBrowserClientTargetFlags(ctx.flags))
    const action = BrowserClientMarkupAction.safeParse(getRequiredStringFlag(ctx.flags, 'action'))
    if (viewer !== 'host' || !target.success || !action.success) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Specify an exact materialized client browser target and markup action.'
      )
    }
    const result = await ctx.client.call<BrowserViewerResult>('ui.browserViewer', {
      viewer,
      operation: 'client-markup',
      target: target.data,
      action: action.data
    })
    const acknowledgment = BrowserClientMarkupReceipt.safeParse(result.result?.clientMarkup)
    if (
      !result.result?.applied ||
      !acknowledgment.success ||
      acknowledgment.data.action !== action.data ||
      Object.entries(target.data).some(
        ([key, value]) => Reflect.get(acknowledgment.data, key) !== value
      ) ||
      (action.data === 'start' &&
        (acknowledgment.data.state !== 'drawing' || !acknowledgment.data.hasImage)) ||
      (action.data === 'copy' &&
        (!acknowledgment.data.copied ||
          acknowledgment.data.state !== 'idle' ||
          acknowledgment.data.hasImage)) ||
      (action.data === 'cancel' &&
        (acknowledgment.data.state !== 'idle' || acknowledgment.data.hasImage))
    ) {
      throw new RuntimeClientError(
        'runtime_error',
        'Client markup action was not acknowledged by its exact viewer owner.'
      )
    }
    printResult(
      {
        id: result.id,
        ok: true,
        _meta: { runtimeId: result._meta.runtimeId },
        result: { applied: true, page: acknowledgment.data.page, clientMarkup: acknowledgment.data }
      },
      ctx.json,
      (value) => JSON.stringify(value, null, 2)
    )
  }
}
