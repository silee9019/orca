import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { requireBrowserViewerConfirmation, runViewerCommand } from './browser-viewer-command'
export const BROWSER_TAB_UI_HANDLERS: Record<string, CommandHandler> = {
  'browser tab-ui': (ctx) => {
    const action = getRequiredStringFlag(ctx.flags, 'action')
    if (
      action === 'close' ||
      action === 'close-others' ||
      action === 'close-left' ||
      action === 'close-right'
    ) {
      requireBrowserViewerConfirmation(ctx)
    }
    return runViewerCommand(ctx, {
      viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
      operation: 'tab-ui',
      action,
      target: {
        workspace: getRequiredStringFlag(ctx.flags, 'workspace'),
        worktree: getRequiredStringFlag(ctx.flags, 'worktree'),
        group: getRequiredStringFlag(ctx.flags, 'group'),
        unifiedTab: getRequiredStringFlag(ctx.flags, 'unified-tab')
      }
    })
  }
}
