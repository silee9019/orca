import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { runViewerCommand } from './browser-viewer-command'

export const BROWSER_DOCUMENT_HANDLERS: Record<string, CommandHandler> = {
  'browser document': (ctx) =>
    runViewerCommand(ctx, {
      viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
      page: getRequiredStringFlag(ctx.flags, 'page'),
      operation: 'document',
      command: {
        action: getRequiredStringFlag(ctx.flags, 'action'),
        ...(getRequiredStringFlag(ctx.flags, 'action') === 'directory-allow'
          ? {
              paths: getRequiredStringFlag(ctx.flags, 'paths').split('\n'),
              confirmation: getRequiredStringFlag(ctx.flags, 'confirm-page')
            }
          : {})
      }
    })
}
