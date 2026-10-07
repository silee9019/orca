import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'
import { FloatingBrowserCommand } from '../../shared/rpc-contract/floating-browser-params'
import type { BrowserViewerResult } from '../../shared/browser-viewer-command'
export const FLOATING_BROWSER_VIEWER_HANDLERS: Record<string, CommandHandler> = {
  'browser floating viewer': async (ctx) => {
    const action = getRequiredStringFlag(ctx.flags, 'action')
    const command = FloatingBrowserCommand.safeParse({
      action,
      groupId: getRequiredStringFlag(ctx.flags, 'group'),
      ...(action === 'duplicate'
        ? {
            browserTabId: getRequiredStringFlag(ctx.flags, 'browser-tab'),
            sourceUnifiedTabId: getRequiredStringFlag(ctx.flags, 'source-tab')
          }
        : {})
    })
    if (!command.success || getRequiredStringFlag(ctx.flags, 'viewer') !== 'host') {
      throw new RuntimeClientError(
        'invalid_argument',
        'Specify --viewer host and a valid floating browser action.'
      )
    }
    const result = await ctx.client.call<BrowserViewerResult>('ui.browserViewer', {
      viewer: 'host',
      operation: 'floating-browser',
      command: command.data
    })
    if (
      !result.result.applied ||
      !result.result.floatingBrowser?.active ||
      !result.result.floatingBrowser.profilePreserved ||
      !result.result.floatingBrowser.partitionPreserved
    ) {
      throw new RuntimeClientError(
        'runtime_error',
        'Floating browser owner did not acknowledge the complete action.'
      )
    }
    printResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
