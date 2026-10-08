import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'
import {
  BrowserClientHistoryDocumentCommand,
  BrowserClientHistoryDocumentReceipt
} from '../../shared/rpc-contract/browser-client-history-document-params'

function handler(kind: 'materialized' | 'staged'): CommandHandler {
  return async (ctx) => {
    const target = {
      worktreeId: getRequiredStringFlag(ctx.flags, 'worktree'),
      page: getRequiredStringFlag(ctx.flags, 'page'),
      environmentId: getRequiredStringFlag(ctx.flags, 'runtime-environment'),
      remotePageId: getRequiredStringFlag(ctx.flags, 'remote-page'),
      ...(kind === 'materialized'
        ? {
            browserHostClientId: getRequiredStringFlag(ctx.flags, 'browser-client'),
            browserHostGeneration: Number(
              getRequiredStringFlag(ctx.flags, 'browser-host-generation')
            ),
            pageHostGeneration: Number(getRequiredStringFlag(ctx.flags, 'page-host-generation'))
          }
        : {})
    }
    const command = BrowserClientHistoryDocumentCommand.safeParse({
      viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
      operation: 'client-history-document',
      source: { kind, target },
      item: {
        index: Number(getRequiredStringFlag(ctx.flags, 'index')),
        worktreeId: getRequiredStringFlag(ctx.flags, 'document-worktree'),
        filePath: getRequiredStringFlag(ctx.flags, 'value')
      }
    })
    if (!command.success) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Specify an exact client page and current document suggestion identity.'
      )
    }
    const response = await ctx.client.call<{
      applied?: unknown
      clientHistoryDocument?: unknown
    }>('ui.browserViewer', command.data)
    const receipt = BrowserClientHistoryDocumentReceipt.safeParse(
      response.result?.clientHistoryDocument
    )
    if (
      response.result?.applied !== true ||
      !receipt.success ||
      receipt.data.source.kind !== kind ||
      Object.entries(command.data.source.target).some(
        ([key, value]) => Reflect.get(receipt.data.source.target, key) !== value
      ) ||
      Object.entries(command.data.item).some(
        ([key, value]) => Reflect.get(receipt.data.item, key) !== value
      )
    ) {
      throw new RuntimeClientError(
        'runtime_error',
        'The exact history selection and destination document were not acknowledged.'
      )
    }
    printResult(
      {
        id: response.id,
        ok: true,
        _meta: { runtimeId: response._meta.runtimeId },
        result: { applied: true, clientHistoryDocument: receipt.data }
      },
      ctx.json,
      (value) => JSON.stringify(value, null, 2)
    )
  }
}
export const BROWSER_CLIENT_HISTORY_DOCUMENT_HANDLERS: Record<string, CommandHandler> = {
  'browser client-history-document': handler('materialized'),
  'browser client-staged-history-document': handler('staged')
}
