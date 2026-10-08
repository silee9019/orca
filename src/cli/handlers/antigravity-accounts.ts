import { requireAccountsPermissionsExecutionHost } from '../accounts-permissions-host-boundary'
import type { CommandHandler, HandlerContext } from '../dispatch'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'
import { rejectRemoteSelectionFlags } from '../remote-selection-flag-rejection'
import {
  AntigravityAccountTargetParams,
  AntigravityAccountMutationParams
} from '../../shared/rpc-contract/antigravity-accounts-params'
import type { AntigravityAccountState } from '../../shared/antigravity-account-types'
import type { RateLimitState } from '../../shared/rate-limit-types'
import { getWslAccountTarget } from './account-wsl-location'

async function runAntigravityAccount(
  ctx: HandlerContext,
  action: 'List' | 'AddCurrent' | 'Select' | 'Remove' | 'Usage'
): Promise<void> {
  requireAccountsPermissionsExecutionHost(ctx)
  rejectRemoteSelectionFlags(
    ctx.flags,
    '`orca account antigravity`. Run it on the account owner host.'
  )
  const inferred = getWslAccountTarget(ctx.cwd)
  const target = AntigravityAccountTargetParams.safeParse({
    runtime: ctx.flags.get('runtime') ?? inferred?.runtime ?? 'host',
    wslDistro: ctx.flags.get('wsl-distro') ?? inferred?.wslDistro ?? null
  })
  if (!target.success) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Use --runtime host|wsl and an optional --wsl-distro <name>.'
    )
  }
  if (target.data.runtime === 'host' && target.data.wslDistro) {
    throw new RuntimeClientError('invalid_argument', '--wsl-distro requires --runtime wsl.')
  }
  if (action === 'Usage') {
    const before = await ctx.client.call<AntigravityAccountState>(
      'accounts.antigravityList',
      target.data
    )
    const snapshot = await ctx.client.call<{ rateLimits: RateLimitState }>('accounts.list', {
      refreshUsage: true
    })
    const after = await ctx.client.call<AntigravityAccountState>(
      'accounts.antigravityList',
      target.data
    )
    if (
      !before.result.currentAccount?.subject ||
      before.result.currentAccount.subject !== after.result.currentAccount?.subject ||
      before.result.currentAccount.authMethod !== after.result.currentAccount?.authMethod
    ) {
      throw new RuntimeClientError(
        'invalid_argument',
        'The native account changed while reading usage. Refresh usage again.'
      )
    }
    printResult(
      {
        ...after,
        result: { account: after.result, usage: snapshot.result.rateLimits.antigravity }
      },
      ctx.json,
      (value) => JSON.stringify(value, null, 2)
    )
    return
  }
  if (action === 'Remove' && ctx.flags.get('confirm') !== 'true') {
    throw new RuntimeClientError(
      'invalid_argument',
      'Removing an Antigravity account requires --confirm true.'
    )
  }
  let params: unknown = target.data
  if (action === 'Select' || action === 'Remove') {
    const mutation = AntigravityAccountMutationParams.safeParse({
      target: target.data,
      accountId: ctx.flags.get('account')
    })
    if (!mutation.success) {
      throw new RuntimeClientError('invalid_argument', 'Use --account <id>.')
    }
    params = mutation.data
  }
  const result = await ctx.client.call(`accounts.antigravity${action}`, params)
  printResult(result, ctx.json, (state) => JSON.stringify(state, null, 2))
}

export const ANTIGRAVITY_ACCOUNT_HANDLERS: Record<string, CommandHandler> = {
  'account antigravity list': (ctx) => runAntigravityAccount(ctx, 'List'),
  'account antigravity add-current': (ctx) => runAntigravityAccount(ctx, 'AddCurrent'),
  'account antigravity select': (ctx) => runAntigravityAccount(ctx, 'Select'),
  'account antigravity rm': (ctx) => runAntigravityAccount(ctx, 'Remove'),
  'account antigravity usage': (ctx) => runAntigravityAccount(ctx, 'Usage')
}
