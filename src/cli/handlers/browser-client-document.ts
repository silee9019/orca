import {
  BrowserClientDocumentValue,
  BrowserClientDocumentReceipt
} from '../../shared/rpc-contract/browser-client-document-params'
import { readBrowserClientTargetFlags } from './browser-client-target-flags'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag, getOptionalStringFlag } from '../flags'
import { RuntimeClientError } from '../runtime-client'
import { printResult } from '../format'
import { BrowserClientNavigationTarget } from '../../shared/rpc-contract/browser-client-navigation-params'
import type { BrowserViewerResult } from '../../shared/browser-viewer-command'
export const BROWSER_CLIENT_DOCUMENT_HANDLERS: Record<string, CommandHandler> = {
  'browser client-document': async (ctx) => {
    const viewer = getRequiredStringFlag(ctx.flags, 'viewer')
    const documentWorktreeId = getOptionalStringFlag(ctx.flags, 'document-worktree')?.trim()
    const target = BrowserClientNavigationTarget.safeParse(readBrowserClientTargetFlags(ctx.flags))
    const value = BrowserClientDocumentValue.safeParse(getRequiredStringFlag(ctx.flags, 'value'))
    if (viewer !== 'host' || !target.success || !value.success || documentWorktreeId === '') {
      throw new RuntimeClientError(
        'invalid_argument',
        'Specify an exact materialized client browser target and a workspace document path.'
      )
    }
    const result = await ctx.client.call<BrowserViewerResult>('ui.browserViewer', {
      viewer,
      operation: 'client-document',
      entry: 'address-bar',
      target: target.data,
      value: value.data,
      ...(documentWorktreeId ? { documentWorktreeId } : {})
    })
    const acknowledgment = BrowserClientDocumentReceipt.safeParse(result.result?.clientDocument)
    if (
      !result.result?.applied ||
      !acknowledgment.success ||
      acknowledgment.data.conversion === 'unknown' ||
      acknowledgment.data.documentWorktreeId !== (documentWorktreeId ?? target.data.worktreeId) ||
      Object.entries(target.data).some(
        ([key, value]) => Reflect.get(acknowledgment.data, key) !== value
      )
    ) {
      throw new RuntimeClientError(
        'runtime_error',
        'Client document conversion was not acknowledged by its exact viewer and document Store.'
      )
    }
    printResult(
      {
        id: result.id,
        ok: true,
        _meta: { runtimeId: result._meta.runtimeId },
        result: { applied: true, page: target.data.page, clientDocument: acknowledgment.data }
      },
      ctx.json,
      (value) => JSON.stringify(value, null, 2)
    )
  }
}
