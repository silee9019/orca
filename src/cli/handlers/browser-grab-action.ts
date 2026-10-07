import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { runViewerCommand } from './browser-viewer-command'
export const runBrowserGrabAction: CommandHandler = (ctx) =>
  runViewerCommand(ctx, {
    operation: 'grab-action',
    viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
    page: getRequiredStringFlag(ctx.flags, 'page'),
    key: getRequiredStringFlag(ctx.flags, 'key')
  })
