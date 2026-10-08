import type { CommandHandler } from '../dispatch'
import {
  getRequiredStringFlag,
  getRequiredStringFlagAllowingEmpty,
  getOptionalStringFlag
} from '../flags'
import { runViewerCommand, requireBrowserViewerConfirmation } from './browser-viewer-command'
export const runBrowserProfileUi: CommandHandler = (ctx) => {
  const action = getRequiredStringFlag(ctx.flags, 'action')
  if (
    action === 'switch-confirm' ||
    action === 'new-create' ||
    action === 'import-browser' ||
    action === 'import-file'
  ) {
    requireBrowserViewerConfirmation(ctx)
  }
  return runViewerCommand(ctx, {
    viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
    page: getRequiredStringFlag(ctx.flags, 'page'),
    operation: 'profile-ui',
    command: {
      action,
      ...(action === 'import-browser'
        ? {
            family: getRequiredStringFlag(ctx.flags, 'family'),
            ...(getOptionalStringFlag(ctx.flags, 'browser-profile') !== undefined
              ? { browserProfile: getOptionalStringFlag(ctx.flags, 'browser-profile') }
              : {})
          }
        : {}),
      ...(action === 'import-file' ? { filePath: getRequiredStringFlag(ctx.flags, 'file') } : {}),
      ...(action === 'select' ? { profile: getRequiredStringFlag(ctx.flags, 'profile') } : {}),
      ...(action === 'new-name'
        ? { name: getRequiredStringFlagAllowingEmpty(ctx.flags, 'name') }
        : {})
    }
  })
}
