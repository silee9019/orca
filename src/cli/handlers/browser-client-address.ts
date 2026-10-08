import { redactKagiSessionToken } from '../../shared/browser-url'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag, getRequiredStringFlagAllowingEmpty } from '../flags'
import { RuntimeClientError } from '../runtime-client'
import { printResult } from '../format'
import { readBrowserClientTargetFlags } from './browser-client-target-flags'
import {
  BrowserClientAddressTarget,
  BrowserClientAddressCommand,
  BrowserClientAddressReceipt
} from '../../shared/rpc-contract/browser-client-address-params'
import type { BrowserViewerResult } from '../../shared/browser-viewer-command'
export const BROWSER_CLIENT_ADDRESS_HANDLERS: Record<string, CommandHandler> = {
  'browser client-address': async (ctx) => {
    const viewer = getRequiredStringFlag(ctx.flags, 'viewer')
    const target = BrowserClientAddressTarget.safeParse(readBrowserClientTargetFlags(ctx.flags))
    const action = getRequiredStringFlag(ctx.flags, 'action')
    const command = BrowserClientAddressCommand.safeParse({
      action,
      ...(action === 'draft'
        ? { text: getRequiredStringFlagAllowingEmpty(ctx.flags, 'text') }
        : {}),
      ...(action === 'preview' || action === 'highlight'
        ? { index: Number(getRequiredStringFlag(ctx.flags, 'index')) }
        : {})
    })
    if (viewer !== 'host' || !target.success || !command.success) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Specify an exact client page and a supported address editing action.'
      )
    }
    const result = await ctx.client.call<BrowserViewerResult>('ui.browserViewer', {
      viewer,
      operation: 'client-address',
      target: target.data,
      command: command.data
    })
    const acknowledgment = BrowserClientAddressReceipt.safeParse(result.result?.clientAddress)
    if (
      !result.result?.applied ||
      !acknowledgment.success ||
      Object.entries(target.data).some(
        ([key, value]) => Reflect.get(acknowledgment.data.target, key) !== value
      )
    ) {
      throw new RuntimeClientError(
        'runtime_error',
        'Client address editing was not acknowledged by its exact viewer owner.'
      )
    }
    const state = acknowledgment.data.state
    if (
      (command.data.action === 'draft' &&
        state.value !== redactKagiSessionToken(command.data.text)) ||
      ((action === 'open' || action === 'focus') && (!state.focused || !state.open)) ||
      (action === 'focus' && !state.chromeFocusOwnerInvoked) ||
      (action === 'blur' && (state.focused || state.open)) ||
      (action === 'dismiss' && state.open)
    ) {
      throw new RuntimeClientError(
        'runtime_error',
        'The client address receipt does not confirm the requested editing effect.'
      )
    }
    printResult(
      {
        id: result.id,
        ok: true,
        _meta: { runtimeId: result._meta.runtimeId },
        result: { applied: true, clientAddress: acknowledgment.data }
      },
      ctx.json,
      (value) => JSON.stringify(value, null, 2)
    )
  }
}
