import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag, getRequiredStringFlagAllowingEmpty } from '../flags'
import { runViewerCommand, requireBrowserViewerConfirmation } from './browser-viewer-command'
export const runBrowserAnnotationRow: CommandHandler = (ctx) => {
  const action = getRequiredStringFlag(ctx.flags, 'action')
  if (action === 'save') {
    requireBrowserViewerConfirmation(ctx)
  }
  return runViewerCommand(ctx, {
    operation: 'annotation-row',
    viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
    page: getRequiredStringFlag(ctx.flags, 'page'),
    command: {
      action,
      ...(action === 'start'
        ? { annotationId: getRequiredStringFlag(ctx.flags, 'annotation') }
        : {}),
      ...(action === 'comment'
        ? { value: getRequiredStringFlagAllowingEmpty(ctx.flags, 'text') }
        : {}),
      ...(action === 'intent' ? { value: getRequiredStringFlag(ctx.flags, 'intent') } : {})
    }
  })
}
