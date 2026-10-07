import { requireAccountsPermissionsExecutionHost } from '../accounts-permissions-host-boundary'
import type { HandlerContext } from '../dispatch'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'
import type {
  ClaudeRateLimitAccountsState,
  CodexRateLimitAccountsState
} from '../../shared/managed-account-types'
import { mutateDataAccount } from './data-account-commands'
import { getWslAccountTarget } from './account-wsl-location'
import { formatAccountsBlock } from './account-list-format'

export async function mutateManagedAccount(
  ctx: HandlerContext,
  action: 'select' | 'remove'
): Promise<void> {
  requireAccountsPermissionsExecutionHost(ctx)
  const agent = ctx.flags.get('agent')
  if (agent !== 'claude' && agent !== 'codex') {
    await mutateDataAccount(ctx, action)
    return
  }
  const id = ctx.flags.get('account')
  if (typeof id !== 'string' || !id.trim()) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Use --account <id> (system for the default selection).'
    )
  }
  if (action === 'remove' && id === 'system') {
    throw new RuntimeClientError('invalid_argument', 'System credentials cannot be removed.')
  }
  if (action === 'remove' && ctx.flags.get('confirm') !== 'true') {
    throw new RuntimeClientError(
      'invalid_argument',
      'Removing a Claude or Codex account requires --confirm true.'
    )
  }
  const target = getWslAccountTarget(ctx.cwd)
  const provider = agent === 'claude' ? 'Claude' : 'Codex'
  const result = await ctx.client.call<ClaudeRateLimitAccountsState | CodexRateLimitAccountsState>(
    target && action === 'select'
      ? `accounts.select${provider}ForTarget`
      : `accounts.${action}${provider}`,
    {
      accountId: action === 'select' && id === 'system' ? null : id,
      ...(target && action === 'select' ? { target } : {})
    }
  )
  printResult(result, ctx.json, (state) => formatAccountsBlock(provider, state))
}
