import type { HandlerContext } from '../dispatch'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'
import { BrowserViewerCommand } from '../../shared/rpc-contract/browser-viewer-params'
import type { BrowserViewerResult } from '../../shared/browser-viewer-command'

export async function runViewerCommand(ctx: HandlerContext, command: unknown): Promise<void> {
  const parsed = BrowserViewerCommand.safeParse(command)
  if (!parsed.success) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Invalid browser viewer command; specify --viewer host and valid command flags.'
    )
  }
  const result = await ctx.client.call<BrowserViewerResult>('ui.browserViewer', parsed.data)
  if (!result.result.applied) {
    throw new RuntimeClientError('runtime_error', 'Browser viewer did not apply the command.')
  }
  printResult(result, ctx.json, (value) => JSON.stringify(value, null, 2))
}

export function requireBrowserViewerConfirmation(ctx: HandlerContext): void {
  if (ctx.flags.get('confirm') !== true) {
    throw new RuntimeClientError('invalid_argument', 'Pass --confirm to approve this operation.')
  }
}
