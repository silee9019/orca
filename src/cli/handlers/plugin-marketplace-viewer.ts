import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag, getRequiredStringFlagAllowingEmpty } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'
import { PluginMarketplaceViewerCommand } from '../../shared/rpc-contract/plugin-marketplace-viewer-params'
import type { BrowserViewerResult } from '../../shared/browser-viewer-command'
export const PLUGIN_MARKETPLACE_VIEWER_HANDLERS: Record<string, CommandHandler> = {
  'plugins marketplace viewer': async (ctx) => {
    const action = getRequiredStringFlag(ctx.flags, 'action')
    const parsed = PluginMarketplaceViewerCommand.safeParse({
      action,
      ...(action === 'search' || action === 'filter'
        ? { value: getRequiredStringFlagAllowingEmpty(ctx.flags, 'value') }
        : {})
    })
    if (!parsed.success || getRequiredStringFlag(ctx.flags, 'viewer') !== 'host') {
      throw new RuntimeClientError(
        'invalid_argument',
        'Specify --viewer host and a valid marketplace viewer action.'
      )
    }
    const result = await ctx.client.call<BrowserViewerResult>('ui.browserViewer', {
      viewer: 'host',
      operation: 'plugin-marketplace',
      command: parsed.data
    })
    if (!result.result.applied || !result.result.marketplace) {
      throw new RuntimeClientError(
        'runtime_error',
        'Marketplace catalog owner did not acknowledge the action.'
      )
    }
    printResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
