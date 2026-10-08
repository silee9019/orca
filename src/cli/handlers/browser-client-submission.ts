import {
  BrowserClientSubmissionValue,
  BrowserClientSubmissionReceipt
} from '../../shared/rpc-contract/browser-client-submission-params'
import { readBrowserClientTargetFlags } from './browser-client-target-flags'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { RuntimeClientError } from '../runtime-client'
import { printResult } from '../format'
import { BrowserClientNavigationTarget } from '../../shared/rpc-contract/browser-client-navigation-params'
import type { BrowserViewerResult } from '../../shared/browser-viewer-command'
export const BROWSER_CLIENT_SUBMISSION_HANDLERS: Record<string, CommandHandler> = {
  'browser client-submit': async (ctx) => {
    const viewer = getRequiredStringFlag(ctx.flags, 'viewer')
    const target = BrowserClientNavigationTarget.safeParse(readBrowserClientTargetFlags(ctx.flags))
    const value = BrowserClientSubmissionValue.safeParse(getRequiredStringFlag(ctx.flags, 'value'))
    if (viewer !== 'host' || !target.success || !value.success) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Specify an exact materialized client browser target and a web address or search query.'
      )
    }
    const result = await ctx.client.call<BrowserViewerResult>('ui.browserViewer', {
      viewer,
      operation: 'client-submission',
      entry: 'address-bar',
      target: target.data,
      value: value.data
    })
    const acknowledgment = BrowserClientSubmissionReceipt.safeParse(result.result?.clientSubmission)
    if (
      !result.result?.applied ||
      !acknowledgment.success ||
      Object.entries(target.data).some(
        ([key, value]) => Reflect.get(acknowledgment.data, key) !== value
      )
    ) {
      throw new RuntimeClientError(
        'runtime_error',
        'Client web submission was not acknowledged by its exact viewer and metadata owner.'
      )
    }
    printResult(
      {
        id: result.id,
        ok: true,
        _meta: { runtimeId: result._meta.runtimeId },
        result: { applied: true, page: target.data.page, clientSubmission: acknowledgment.data }
      },
      ctx.json,
      (value) => JSON.stringify(value, null, 2)
    )
  }
}
