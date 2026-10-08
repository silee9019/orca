import { requireAccountsPermissionsExecutionHost } from '../accounts-permissions-host-boundary'
import type { HandlerContext } from '../dispatch'
import { printResult } from '../format'
import type {
  ClaudeRateLimitAccountsState,
  CodexRateLimitAccountsState,
  ManagedDataAccountsState
} from '../../shared/managed-account-types'
import { listDataAccounts } from './data-account-commands'
import { formatAccountsBlock, formatDataAccounts } from './account-list-format'

type AccountsListSnapshot = {
  opencode?: ManagedDataAccountsState
  devin?: ManagedDataAccountsState
  claude: ClaudeRateLimitAccountsState
  codex: CodexRateLimitAccountsState
}

export async function listManagedAccounts(ctx: HandlerContext): Promise<void> {
  requireAccountsPermissionsExecutionHost(ctx)
  const provider = ctx.flags.get('agent')
  if (provider !== undefined && provider !== 'claude' && provider !== 'codex') {
    await listDataAccounts(ctx, provider)
    return
  }
  const { client, json } = ctx
  // Account listing skips provider usage refreshes.
  const result = await client.call<AccountsListSnapshot>('accounts.list', {
    refreshUsage: false
  })
  if (provider === 'claude' || provider === 'codex') {
    const filtered = { ...result, result: result.result[provider] }
    printResult(filtered, json, (state) =>
      formatAccountsBlock(provider === 'claude' ? 'Claude' : 'Codex', state)
    )
    return
  }
  printResult(result, json, (snapshot) =>
    [
      formatAccountsBlock('Claude', snapshot.claude),
      formatAccountsBlock('Codex', snapshot.codex),
      ...(snapshot.opencode ? [formatDataAccounts('OpenCode', snapshot.opencode)] : []),
      ...(snapshot.devin ? [formatDataAccounts('Devin', snapshot.devin)] : [])
    ].join('\n\n')
  )
}
