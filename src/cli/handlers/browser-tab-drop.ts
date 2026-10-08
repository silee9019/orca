import { handleBrowserTabDragCancel } from './browser-tab-drag-cancel'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag, getOptionalStringFlag } from '../flags'
import { RuntimeClientError } from '../runtime-client'
import { printResult } from '../format'
import {
  BrowserTabDropTarget,
  BrowserTabDropDestination,
  BrowserTabDropReceipt
} from '../../shared/rpc-contract/browser-tab-drop-params'
import type { BrowserViewerResult } from '../../shared/browser-viewer-command'
export const BROWSER_TAB_DROP_HANDLERS: Record<string, CommandHandler> = {
  'browser tab-drag cancel': handleBrowserTabDragCancel,
  'browser tab-drop': async (ctx) => {
    const viewer = getRequiredStringFlag(ctx.flags, 'viewer')
    const kind = getRequiredStringFlag(ctx.flags, 'kind')
    const side = getOptionalStringFlag(ctx.flags, 'side')
    const direction = getOptionalStringFlag(ctx.flags, 'direction')
    const tab = getOptionalStringFlag(ctx.flags, 'destination-tab')
    const target = BrowserTabDropTarget.safeParse({
      workspace: getRequiredStringFlag(ctx.flags, 'workspace'),
      worktree: getRequiredStringFlag(ctx.flags, 'worktree'),
      group: getRequiredStringFlag(ctx.flags, 'group'),
      unifiedTab: getRequiredStringFlag(ctx.flags, 'unified-tab'),
      environmentId: getOptionalStringFlag(ctx.flags, 'runtime-environment') ?? null
    })
    const destination = BrowserTabDropDestination.safeParse({
      kind,
      group: getRequiredStringFlag(ctx.flags, 'destination-group'),
      ...(kind === 'tab' ? { tab, side } : {}),
      ...(kind === 'split' ? { direction } : {})
    })
    if (
      viewer !== 'host' ||
      !target.success ||
      !destination.success ||
      (kind !== 'tab' && (tab !== undefined || side !== undefined)) ||
      (kind !== 'split' && direction !== undefined)
    ) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Specify an exact browser tab and a resolved tab, pane, or split destination.'
      )
    }
    const result = await ctx.client.call<BrowserViewerResult>('ui.browserViewer', {
      viewer,
      operation: 'tab-drop',
      target: target.data,
      destination: destination.data
    })
    const acknowledgment = BrowserTabDropReceipt.safeParse(result.result?.tabDrop)
    if (
      !result.result?.applied ||
      !acknowledgment.success ||
      JSON.stringify(acknowledgment.data.target) !== JSON.stringify(target.data) ||
      JSON.stringify(acknowledgment.data.destination) !== JSON.stringify(destination.data) ||
      (target.data.environmentId !== null && !acknowledgment.data.hostMoveAcknowledged)
    ) {
      throw new RuntimeClientError(
        'runtime_error',
        'Browser tab movement was not acknowledged by its exact viewer and host.'
      )
    }
    printResult(
      {
        id: result.id,
        ok: true,
        _meta: { runtimeId: result._meta.runtimeId },
        result: { applied: true, tabDrop: acknowledgment.data }
      },
      ctx.json,
      (value) => JSON.stringify(value, null, 2)
    )
  }
}
