import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag, getRequiredStringFlagAllowingEmpty } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'
import { BrowserSettingsCommand } from '../../shared/rpc-contract/browser-settings-params'
import type { BrowserViewerResult } from '../../shared/browser-viewer-command'
export const BROWSER_SETTINGS_VIEWER_HANDLERS: Record<string, CommandHandler> = {
  'browser settings viewer': async (ctx) => {
    const action = getRequiredStringFlag(ctx.flags, 'action')
    const extra =
      action === 'homepage-draft' || action === 'profile-name'
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
    printResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
