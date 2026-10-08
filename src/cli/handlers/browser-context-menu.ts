import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { runViewerCommand, requireBrowserViewerConfirmation } from './browser-viewer-command'
export const runBrowserContextMenu: CommandHandler = (ctx) => {
  const action = getRequiredStringFlag(ctx.flags, 'action')
  if (
    action === 'open-link-external' ||
    action === 'open-page-external' ||
    action === 'open-link' ||
    action === 'inspect'
  ) {
    requireBrowserViewerConfirmation(ctx)
  }
  return runViewerCommand(ctx, {
    operation: 'context-menu',
    viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
    page: getRequiredStringFlag(ctx.flags, 'page'),
    action
  })
}
