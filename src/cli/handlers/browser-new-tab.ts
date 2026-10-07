import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { requireBrowserViewerConfirmation, runViewerCommand } from './browser-viewer-command'
export const runBrowserNewTab: CommandHandler = (ctx) => {
  requireBrowserViewerConfirmation(ctx)
  return runViewerCommand(ctx, {
    viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
    operation: 'new-tab',
    target: {
      worktree: getRequiredStringFlag(ctx.flags, 'worktree'),
      group: getRequiredStringFlag(ctx.flags, 'group')
    }
  })
}
