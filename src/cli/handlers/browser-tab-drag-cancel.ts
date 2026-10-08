import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag, getOptionalStringFlag } from '../flags'
import { RuntimeClientError } from '../runtime-client'
import { printResult } from '../format'
import {
  BrowserTabDropTarget,
  BrowserTabDragCancelReceipt
} from '../../shared/rpc-contract/browser-tab-drop-params'
import type { BrowserViewerResult } from '../../shared/browser-viewer-command'
export const handleBrowserTabDragCancel: CommandHandler = async (ctx) => {
  const viewer = getRequiredStringFlag(ctx.flags, 'viewer')
  const target = BrowserTabDropTarget.safeParse({
    workspace: getRequiredStringFlag(ctx.flags, 'workspace'),
    worktree: getRequiredStringFlag(ctx.flags, 'worktree'),
    group: getRequiredStringFlag(ctx.flags, 'group'),
    unifiedTab: getRequiredStringFlag(ctx.flags, 'unified-tab'),
    environmentId: getOptionalStringFlag(ctx.flags, 'runtime-environment') ?? null
  })
  if (viewer !== 'host' || !target.success) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Specify the exact browser tab whose existing drag should be cancelled.'
    )
  }
  const result = await ctx.client.call<BrowserViewerResult>('ui.browserViewer', {
    viewer,
    operation: 'tab-drag-cancel',
    target: target.data
  })
  const acknowledgment = BrowserTabDragCancelReceipt.safeParse(result.result?.tabDragCancel)
  if (
    !result.result?.applied ||
    !acknowledgment.success ||
    JSON.stringify(acknowledgment.data.target) !== JSON.stringify(target.data)
  ) {
    throw new RuntimeClientError(
      'runtime_error',
      'Browser drag cancellation was not acknowledged by its exact active gesture owner.'
    )
  }
  printResult(
    {
      id: result.id,
      ok: true,
      _meta: { runtimeId: result._meta.runtimeId },
      result: { applied: true, tabDragCancel: acknowledgment.data }
    },
    ctx.json,
    (value) => JSON.stringify(value, null, 2)
  )
}
