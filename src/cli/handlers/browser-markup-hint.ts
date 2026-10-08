import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { RuntimeClientError } from '../runtime-client'
import { printResult } from '../format'
import {
  BrowserMarkupHintAction,
  BrowserMarkupHintState
} from '../../shared/rpc-contract/browser-markup-hint-params'
import type { BrowserViewerResult } from '../../shared/browser-viewer-command'
export const runBrowserMarkupHint: CommandHandler = async (ctx) => {
  const viewer = getRequiredStringFlag(ctx.flags, 'viewer')
  const page = getRequiredStringFlag(ctx.flags, 'page')
  const action = BrowserMarkupHintAction.safeParse(getRequiredStringFlag(ctx.flags, 'action'))
  if (viewer !== 'host' || !page || !action.success) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Specify --viewer host, an exact page and a valid markup hint action.'
    )
  }
  const response = await ctx.client.call<BrowserViewerResult>('ui.browserViewer', {
    viewer,
    operation: 'markup-hint',
    page,
    action: action.data
  })
  const acknowledgment = BrowserMarkupHintState.safeParse(response.result?.markupHint)
  if (
    !response.result?.applied ||
    !acknowledgment.success ||
    acknowledgment.data.page !== page ||
    acknowledgment.data.action !== action.data ||
    (action.data !== 'status' && acknowledgment.data.hintOpen) ||
    (action.data === 'toggle' && acknowledgment.data.disabled)
  ) {
    throw new RuntimeClientError(
      'runtime_error',
      'The draw control owner did not acknowledge the requested action.'
    )
  }
  printResult(
    {
      id: response.id,
      ok: true,
      _meta: { runtimeId: response._meta.runtimeId },
      result: { applied: true, page, markupHint: acknowledgment.data }
    },
    ctx.json,
    (value) => JSON.stringify(value, null, 2)
  )
}
