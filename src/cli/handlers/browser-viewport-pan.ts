import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { RuntimeClientError } from '../runtime-client'
import { printResult } from '../format'
import {
  BrowserViewportPanDelta,
  BrowserViewportPanReceipt
} from '../../shared/rpc-contract/browser-viewport-pan-params'
import type { BrowserViewerResult } from '../../shared/browser-viewer-command'
export const runBrowserViewportPan: CommandHandler = async (ctx) => {
  const viewer = getRequiredStringFlag(ctx.flags, 'viewer')
  const page = getRequiredStringFlag(ctx.flags, 'page')
  const delta = BrowserViewportPanDelta.safeParse({
    deltaX: Number(getRequiredStringFlag(ctx.flags, 'delta-x')),
    deltaY: Number(getRequiredStringFlag(ctx.flags, 'delta-y'))
  })
  if (viewer !== 'host' || !delta.success) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Specify --viewer host and finite panel deltas within 100000 pixels.'
    )
  }
  const response = await ctx.client.call<BrowserViewerResult>('ui.browserViewer', {
    viewer,
    operation: 'viewport-pan',
    page,
    delta: delta.data
  })
  const receipt = BrowserViewportPanReceipt.safeParse(response.result?.viewportPan)
  if (
    !response.result?.applied ||
    !receipt.success ||
    receipt.data.page !== page ||
    receipt.data.delta.deltaX !== delta.data.deltaX ||
    receipt.data.delta.deltaY !== delta.data.deltaY
  ) {
    throw new RuntimeClientError(
      'runtime_error',
      'The browser panel owner did not acknowledge the requested pan.'
    )
  }
  printResult(
    {
      id: response.id,
      ok: true,
      _meta: { runtimeId: response._meta.runtimeId },
      result: { applied: true, page, viewportPan: receipt.data }
    },
    ctx.json,
    (value) => JSON.stringify(value, null, 2)
  )
}
