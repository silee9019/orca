import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { runViewerCommand } from './browser-viewer-command'
export const runBrowserReloadMenu: CommandHandler = (ctx) =>
  runViewerCommand(ctx, {
    operation: 'reload-menu',
    viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
    page: getRequiredStringFlag(ctx.flags, 'page'),
    action: getRequiredStringFlag(ctx.flags, 'action')
  })
