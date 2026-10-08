import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { RuntimeClientError } from '../runtime-client'
import { printResult } from '../format'
import { readBrowserClientTargetFlags } from './browser-client-target-flags'
import {
  BrowserClientReloadViewerCommand,
  BrowserClientReloadReceipt
} from '../../shared/rpc-contract/browser-client-reload-params'
import type { BrowserViewerResult } from '../../shared/browser-viewer-command'
export const BROWSER_CLIENT_RELOAD_HANDLERS: Record<string, CommandHandler> = {
  'browser client-reload': async (ctx) => {
    const command = BrowserClientReloadViewerCommand.safeParse({
      viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
      operation: 'client-reload',
      target: readBrowserClientTargetFlags(ctx.flags),
      entry: 'context-menu'
    })
    if (!command.success) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Specify an exact client-hosted page and host viewer.'
      )
    }
    const result = await ctx.client.call<BrowserViewerResult>('ui.browserViewer', command.data)
    const acknowledgment = BrowserClientReloadReceipt.safeParse(result.result?.clientReload)
    if (
      !result.result?.applied ||
      !acknowledgment.success ||
      Object.entries(command.data.target).some(
        ([key, value]) => Reflect.get(acknowledgment.data.target, key) !== value
      )
    ) {
      throw new RuntimeClientError(
        'runtime_error',
        'Client context reload was not acknowledged by its exact viewer owner.'
      )
    }
    printResult(
      {
        id: result.id,
        ok: true,
        _meta: { runtimeId: result._meta.runtimeId },
        result: { applied: true, clientReload: acknowledgment.data }
      },
      ctx.json,
      (value) => JSON.stringify(value, null, 2)
    )
  }
}
