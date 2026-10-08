import { requireAccountsPermissionsExecutionHost } from '../accounts-permissions-host-boundary'
import type { CommandHandler, HandlerContext } from '../dispatch'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'
import { rejectRemoteSelectionFlags } from '../remote-selection-flag-rejection'
import { AccountPreferenceParams } from '../../shared/rpc-contract/account-preference-params'

async function runAccountPreference(ctx: HandlerContext, action: 'status' | 'set'): Promise<void> {
  requireAccountsPermissionsExecutionHost(ctx)
  rejectRemoteSelectionFlags(
    ctx.flags,
    '`orca account preference`. Run it on the settings owner host.'
  )
  const operation = AccountPreferenceParams.safeParse(
    action === 'status'
      ? { action }
      : { action, key: ctx.flags.get('key'), value: ctx.flags.get('value') }
  )
  if (!operation.success) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Use a supported account preference --key and --value.'
    )
  }
  const result = await ctx.client.call('accountPreference.control', operation.data)
  printResult(result, ctx.json, (state) => JSON.stringify(state, null, 2))
}

export const ACCOUNT_PREFERENCE_HANDLERS: Record<string, CommandHandler> = {
  'account preference status': (ctx) => runAccountPreference(ctx, 'status'),
  'account preference set': (ctx) => runAccountPreference(ctx, 'set')
}
