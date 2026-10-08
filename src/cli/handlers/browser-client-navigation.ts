import { readBrowserClientTargetFlags } from './browser-client-target-flags'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { RuntimeClientError } from '../runtime-client'
import { printResult } from '../format'
import {
  BrowserClientNavigationTarget,
  BrowserClientNavigationUrl,
  BrowserClientNavigationReceipt
} from '../../shared/rpc-contract/browser-client-navigation-params'
import type { BrowserViewerResult } from '../../shared/browser-viewer-command'
export const BROWSER_CLIENT_NAVIGATION_HANDLERS: Record<string, CommandHandler> = {
  'browser client-navigate': async (ctx) => {
    const viewer = getRequiredStringFlag(ctx.flags, 'viewer')
    const target = BrowserClientNavigationTarget.safeParse(readBrowserClientTargetFlags(ctx.flags))
    const url = BrowserClientNavigationUrl.safeParse(getRequiredStringFlag(ctx.flags, 'url'))
    if (viewer !== 'host' || !target.success || !url.success) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Specify an exact materialized client browser target and an HTTP(S) URL without credentials.'
      )
    }
    const result = await ctx.client.call<BrowserViewerResult>('ui.browserViewer', {
      viewer,
      operation: 'client-navigation',
      target: target.data,
      url: url.data
    })
    const acknowledgment = BrowserClientNavigationReceipt.safeParse(result.result?.clientNavigation)
    if (
      !result.result?.applied ||
      !acknowledgment.success ||
      Object.entries(target.data).some(
        ([key, value]) => Reflect.get(acknowledgment.data, key) !== value
      )
    ) {
      throw new RuntimeClientError(
        'runtime_error',
        'Client navigation was not acknowledged by its exact viewer and metadata owner.'
      )
    }
    printResult(
      {
        id: result.id,
        ok: true,
        _meta: { runtimeId: result._meta.runtimeId },
        result: { applied: true, page: target.data.page, clientNavigation: acknowledgment.data }
      },
      ctx.json,
      (value) => JSON.stringify(value, null, 2)
    )
  }
}
