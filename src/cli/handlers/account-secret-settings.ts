import { requireAccountsPermissionsExecutionHost } from '../accounts-permissions-host-boundary'
import { resolve } from 'node:path'
import type { CommandHandler, HandlerContext } from '../dispatch'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'
import { rejectRemoteSelectionFlags } from '../remote-selection-flag-rejection'
import { AccountSecretSettingKey } from '../../shared/rpc-contract/account-secret-settings-params'
import { readCredentialInput } from './account-credentials'

async function runSecretSetting(ctx: HandlerContext, action: 'set' | 'clear'): Promise<void> {
  requireAccountsPermissionsExecutionHost(ctx)
  rejectRemoteSelectionFlags(ctx.flags, '`orca secrets`. Run it on the settings owner host.')
  const key = AccountSecretSettingKey.safeParse(ctx.flags.get('key'))
  if (!key.success) {
    throw new RuntimeClientError('invalid_argument', 'Use a supported sensitive setting --key.')
  }
  let input: string | undefined
  if (action === 'set') {
    const path = ctx.flags.get('input-file')
    if (typeof path !== 'string' || !path || (path === '-' && process.stdin.isTTY)) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Provide --input-file <path|-> or pipe stdin.'
      )
    }
    try {
      input = readCredentialInput(path === '-' ? 0 : resolve(ctx.cwd, path))
    } catch {
      throw new RuntimeClientError(
        'invalid_argument',
        'Could not read a setting input of at most 65536 bytes.'
      )
    }
  }
  const response = await ctx.client
    .call('accountSecretSettings.apply', {
      action,
      key: key.data,
      ...(input === undefined ? {} : { input })
    })
    .catch(() => {
      throw new RuntimeClientError(
        'sensitive_setting_write_unconfirmed',
        'Could not confirm the sensitive setting update through the canonical settings writer on the settings host.'
      )
    })
  printResult({ ...response, result: { key: key.data, updated: true } }, ctx.json, (status) =>
    JSON.stringify(status)
  )
}

export const ACCOUNT_SECRET_SETTING_HANDLERS: Record<string, CommandHandler> = {
  'secrets set': (ctx) => runSecretSetting(ctx, 'set'),
  'secrets clear': (ctx) => runSecretSetting(ctx, 'clear')
}
