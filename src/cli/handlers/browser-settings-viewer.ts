import { resolve } from 'node:path'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag, getRequiredStringFlagAllowingEmpty } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'
import { BrowserSettingsCommand } from '../../shared/rpc-contract/browser-settings-params'
import type { BrowserViewerResult } from '../../shared/browser-viewer-command'
export const BROWSER_SETTINGS_VIEWER_HANDLERS: Record<string, CommandHandler> = {
  'browser settings viewer': async (ctx) => {
    const action = getRequiredStringFlag(ctx.flags, 'action')
    const extra: Record<string, unknown> =
      action === 'browser-use-copy-example'
        ? { index: Number(getRequiredStringFlag(ctx.flags, 'value')) }
        : action === 'homepage-draft' || action === 'profile-name'
          ? { value: getRequiredStringFlagAllowingEmpty(ctx.flags, 'value') }
          : action === 'search-engine'
            ? { engine: getRequiredStringFlag(ctx.flags, 'value') }
            : action === 'zoom'
              ? { value: Number(getRequiredStringFlag(ctx.flags, 'value')) }
              : action === 'host-select'
                ? { hostId: getRequiredStringFlag(ctx.flags, 'value') }
                : action === 'profile-select'
                  ? {
                      profileId:
                        getRequiredStringFlag(ctx.flags, 'profile') === 'default'
                          ? null
                          : getRequiredStringFlag(ctx.flags, 'profile')
                    }
                  : {}
    if (
      [
        'profile-status',
        'cookies-configure',
        'detect-browsers',
        'cookies-import-browser',
        'cookies-import-file',
        'profile-delete',
        'default-cookies-clear'
      ].includes(action)
    ) {
      extra.profileId = getRequiredStringFlag(ctx.flags, 'profile')
      if (action !== 'profile-delete' && action !== 'default-cookies-clear') {
        extra.surface = getRequiredStringFlag(ctx.flags, 'surface')
      }
      if (
        action !== 'detect-browsers' &&
        action !== 'profile-status' &&
        action !== 'cookies-configure'
      ) {
        extra.confirmation = getRequiredStringFlag(ctx.flags, 'confirm')
      }
      if (action === 'cookies-import-browser') {
        extra.browserFamily = getRequiredStringFlag(ctx.flags, 'browser-family')
        const browserProfile = ctx.flags.get('browser-profile')
        if (typeof browserProfile === 'string') {
          extra.browserProfile = browserProfile
        }
      }
      if (action === 'cookies-import-file') {
        extra.filePath = resolve(ctx.cwd, getRequiredStringFlag(ctx.flags, 'file'))
      }
    }
    if (action === 'browser-use-enabled') {
      const enabled = getRequiredStringFlag(ctx.flags, 'value')
      if (enabled !== 'true' && enabled !== 'false') {
        throw new RuntimeClientError('invalid_argument', 'Use --value true or false.')
      }
      extra.enabled = enabled === 'true'
    }
    const parsed = BrowserSettingsCommand.safeParse({ action, ...extra })
    if (!parsed.success || getRequiredStringFlag(ctx.flags, 'viewer') !== 'host') {
      throw new RuntimeClientError(
        'invalid_argument',
        'Specify --viewer host and a valid browser settings action.'
      )
    }
    const result = await ctx.client.call<BrowserViewerResult>('ui.browserViewer', {
      viewer: 'host',
      operation: 'browser-settings',
      hostId: getRequiredStringFlag(ctx.flags, 'host'),
      command: parsed.data
    })
    if (!result.result.applied || !result.result.settings) {
      throw new RuntimeClientError(
        'runtime_error',
        'Browser settings owner did not acknowledge the action.'
      )
    }
    if (action === 'browser-use-refresh' && result.result.settings.skillScanSucceeded !== true) {
      throw new RuntimeClientError(
        'runtime_error',
        'Browser skill scan did not establish a current result.'
      )
    }
    printResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
