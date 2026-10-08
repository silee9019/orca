import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag, getRequiredStringFlagAllowingEmpty } from '../flags'
import { RuntimeClientError } from '../runtime-client'
import { printResult } from '../format'
import { readBrowserClientTargetFlags } from './browser-client-target-flags'
import {
  BrowserClientFindViewerCommand,
  BrowserClientFindReceipt
} from '../../shared/rpc-contract/browser-client-find-params'
import type { BrowserViewerResult } from '../../shared/browser-viewer-command'
export const BROWSER_CLIENT_FIND_HANDLERS: Record<string, CommandHandler> = {
  'browser client-find': async (ctx) => {
    const action = getRequiredStringFlag(ctx.flags, 'action')
    const command = BrowserClientFindViewerCommand.safeParse({
      viewer: getRequiredStringFlag(ctx.flags, 'viewer'),
      operation: 'client-find',
      target: readBrowserClientTargetFlags(ctx.flags),
      action,
      ...(action === 'query'
        ? { query: getRequiredStringFlagAllowingEmpty(ctx.flags, 'query') }
        : {})
    })
    if (!command.success) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Specify an exact client page, find action and bounded query.'
      )
    }
    const result = await ctx.client.call<BrowserViewerResult>('ui.browserViewer', command.data)
    const acknowledgment = BrowserClientFindReceipt.safeParse(result.result?.clientFind)
    if (
      !result.result?.applied ||
      !acknowledgment.success ||
      Object.entries(command.data.target).some(
        ([key, value]) => Reflect.get(acknowledgment.data.target, key) !== value
      ) ||
      (action === 'close' && acknowledgment.data.state.open) ||
      (action !== 'close' && action !== 'status' && !acknowledgment.data.state.open) ||
      (action === 'query' && acknowledgment.data.state.query !== command.data.query)
    ) {
      throw new RuntimeClientError(
        'runtime_error',
        'Client find was not acknowledged by its exact viewer owner.'
      )
    }
    printResult(
      {
        id: result.id,
        ok: true,
        _meta: { runtimeId: result._meta.runtimeId },
        result: { applied: true, clientFind: acknowledgment.data }
      },
      ctx.json,
      (value) => JSON.stringify(value, null, 2)
    )
  }
}
