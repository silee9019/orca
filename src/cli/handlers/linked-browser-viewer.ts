import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag, getOptionalStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'
import { LinkedBrowserCommand } from '../../shared/rpc-contract/linked-browser-params'
import type { BrowserViewerResult } from '../../shared/browser-viewer-command'
export const LINKED_BROWSER_VIEWER_HANDLERS: Record<string, CommandHandler> = {
  'browser linked viewer': async (ctx) => {
    const command = LinkedBrowserCommand.safeParse({
      workspaceId: getRequiredStringFlag(ctx.flags, 'worktree'),
      executionHostId: getRequiredStringFlag(ctx.flags, 'execution-host'),
      runtimeEnvironmentId: getOptionalStringFlag(ctx.flags, 'runtime-environment'),
      surface: getRequiredStringFlag(ctx.flags, 'surface'),
      kind: getRequiredStringFlag(ctx.flags, 'kind'),
      number: Number(getRequiredStringFlag(ctx.flags, 'number')),
      url: getRequiredStringFlag(ctx.flags, 'url')
    })
    if (!command.success || getRequiredStringFlag(ctx.flags, 'viewer') !== 'host') {
      throw new RuntimeClientError(
        'invalid_argument',
        'Specify --viewer host and an exact linked item target.'
      )
    }
    const result = await ctx.client.call<BrowserViewerResult>('ui.browserViewer', {
      viewer: 'host',
      operation: 'linked-browser',
      command: command.data
    })
    if (
      !result.result.applied ||
      !result.result.linkedBrowser?.active ||
      !result.result.linkedBrowser.hoverCloseRequested
    ) {
      throw new RuntimeClientError(
        'runtime_error',
        'Linked browser owner did not acknowledge creation.'
      )
    }
    printResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
  }
}
