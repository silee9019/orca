import { requireAccountsPermissionsExecutionHost } from '../accounts-permissions-host-boundary'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { CommandHandler, HandlerContext } from '../dispatch'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'
import { rejectRemoteSelectionFlags } from '../remote-selection-flag-rejection'
import { AccountLoginProviderParams } from '../../shared/rpc-contract/account-login-params'
import { getWslAccountTarget } from './account-wsl-location'

async function runLoginCommand(
  ctx: HandlerContext,
  action: 'Start' | 'Status' | 'Cancel'
): Promise<void> {
  requireAccountsPermissionsExecutionHost(ctx)
  rejectRemoteSelectionFlags(
    ctx.flags,
    '`orca account login`. Run it on the host whose accounts you want to manage.'
  )
  const provider = AccountLoginProviderParams.safeParse({ provider: ctx.flags.get('agent') })
  if (!provider.success) {
    throw new RuntimeClientError('invalid_argument', 'Use --agent claude or --agent codex.')
  }
  const urlFile = ctx.flags.get('url-file')
  if (
    urlFile !== undefined &&
    (action !== 'Status' ||
      provider.data.provider !== 'codex' ||
      typeof urlFile !== 'string' ||
      !urlFile.trim())
  ) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Use --url-file <new-path> with login status --agent codex.'
    )
  }
  const accountId = ctx.flags.get('account')
  if (accountId !== undefined && (typeof accountId !== 'string' || !accountId.trim())) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Use --account <id> to reauthenticate an existing account.'
    )
  }
  const target = getWslAccountTarget(ctx.cwd)
  const result = await ctx.client.call(`accounts.login${action}`, {
    ...provider.data,
    ...(action === 'Start'
      ? { ...(accountId === undefined ? {} : { accountId }), ...(target ? { target } : {}) }
      : {})
  })
  if (typeof urlFile === 'string') {
    const response = await ctx.client.call<{ url: string | null }>('accounts.loginUrl')
    if (!response.result.url) {
      throw new RuntimeClientError(
        'invalid_argument',
        'No Codex browser authorization URL is pending.'
      )
    }
    try {
      writeFileSync(resolve(ctx.cwd, urlFile), `${response.result.url}\n`, {
        mode: 0o600,
        flag: 'wx'
      })
    } catch {
      throw new RuntimeClientError(
        'invalid_argument',
        'Could not create the authorization URL file; use a new writable path.'
      )
    }
  }
  printResult(result, ctx.json, (status) => JSON.stringify(status, null, 2))
}

export const ACCOUNT_LOGIN_HANDLERS: Record<string, CommandHandler> = {
  'account login start': (ctx) => runLoginCommand(ctx, 'Start'),
  'account login status': (ctx) => runLoginCommand(ctx, 'Status'),
  'account login cancel': (ctx) => runLoginCommand(ctx, 'Cancel')
}
