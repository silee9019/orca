import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { runViewerCommand } from './browser-viewer-command'
export const BROWSER_GROUP_UI_HANDLERS: Record<string, CommandHandler> = {
  'browser group-ui': async (ctx) => {
    await runViewerCommand(ctx, {
      viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
      operation: 'group-ui',
      target: {
        worktree: getRequiredStringFlag(ctx.flags, 'worktree'),
        group: getRequiredStringFlag(ctx.flags, 'group')
      },
      action: getRequiredStringFlag(ctx.flags, 'action')
    })
  }
}
