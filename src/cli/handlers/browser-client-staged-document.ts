import { BrowserClientStagedDocumentReceipt } from '../../shared/rpc-contract/browser-client-staged-document-params'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag, getOptionalStringFlag } from '../flags'
import { RuntimeClientError } from '../runtime-client'
import { printResult } from '../format'
import { BrowserClientStagedTarget } from '../../shared/rpc-contract/browser-client-deferred-params'
import { BrowserClientDocumentValue } from '../../shared/rpc-contract/browser-client-document-params'
import type { BrowserViewerResult } from '../../shared/browser-viewer-command'
export const BROWSER_CLIENT_STAGED_DOCUMENT_HANDLERS: Record<string, CommandHandler> = {
  'browser client-staged-document': async (ctx) => {
    const viewer = getRequiredStringFlag(ctx.flags, 'viewer')
    const documentWorktreeId = getOptionalStringFlag(ctx.flags, 'document-worktree')?.trim()
    const target = BrowserClientStagedTarget.safeParse({
      worktreeId: getRequiredStringFlag(ctx.flags, 'worktree'),
      page: getRequiredStringFlag(ctx.flags, 'page'),
      environmentId: getRequiredStringFlag(ctx.flags, 'runtime-environment'),
      remotePageId: getRequiredStringFlag(ctx.flags, 'remote-page')
    })
    const value = BrowserClientDocumentValue.safeParse(getRequiredStringFlag(ctx.flags, 'value'))
    if (viewer !== 'host' || !target.success || !value.success || documentWorktreeId === '') {
      throw new RuntimeClientError(
        'invalid_argument',
        'Specify an exact staged client browser target and a workspace document path.'
      )
    }
    const result = await ctx.client.call<BrowserViewerResult>('ui.browserViewer', {
      viewer,
      operation: 'client-staged-document',
      entry: 'address-bar-staged',
      target: target.data,
      value: value.data,
      ...(documentWorktreeId ? { documentWorktreeId } : {})
    })
    const acknowledgment = BrowserClientStagedDocumentReceipt.safeParse(
      result.result?.clientStagedDocument
    )
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
        result: { applied: true, page: target.data.page, clientStagedDocument: acknowledgment.data }
      },
      ctx.json,
      (value) => JSON.stringify(value, null, 2)
    )
  }
}
