import { runBrowserToolbarCookieImport } from './browser-toolbar-cookie-import'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag, getRequiredStringFlagAllowingEmpty } from '../flags'
import { runViewerCommand, requireBrowserViewerConfirmation } from './browser-viewer-command'
export const runBrowserProfileUi: CommandHandler = (ctx) => {
  const action = getRequiredStringFlag(ctx.flags, 'action')
  if (action === 'import-file' || action === 'import-browser') {
    return runBrowserToolbarCookieImport(ctx)
  }
  if (action === 'switch-confirm' || action === 'new-create') {
    requireBrowserViewerConfirmation(ctx)
  }
  return runViewerCommand(ctx, {
    viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
    page: getRequiredStringFlag(ctx.flags, 'page'),
    operation: 'profile-ui',
    command: {
      action,
      ...(action === 'select' ? { profile: getRequiredStringFlag(ctx.flags, 'profile') } : {}),
      ...(action === 'new-name'
        ? { name: getRequiredStringFlagAllowingEmpty(ctx.flags, 'name') }
        : {})
    }
  })
}
