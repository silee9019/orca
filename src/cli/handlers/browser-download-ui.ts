import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { runViewerCommand } from './browser-viewer-command'
export const runBrowserDownloadUi: CommandHandler = (ctx) =>
  runViewerCommand(ctx, {
    operation: 'download-ui',
    viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
    page: getRequiredStringFlag(ctx.flags, 'page'),
    downloadId: getRequiredStringFlag(ctx.flags, 'download'),
    action: getRequiredStringFlag(ctx.flags, 'action')
  })
