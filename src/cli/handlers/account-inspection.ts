import type { CommandHandler, HandlerContext } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { requireAccountsPermissionsExecutionHost } from '../accounts-permissions-host-boundary'
import { AccountInspectionParams } from '../../shared/rpc-contract/account-inspection-params'

async function inspect(ctx: HandlerContext, action: string): Promise<void> {
  requireAccountsPermissionsExecutionHost(ctx)
  const panes =
    action === 'codex-stale-panes' ||
    action === 'codex-recorded-lanes' ||
    action === 'codex-forget-panes'
  const params = AccountInspectionParams.parse({
    action,
    ...(panes ? { ptyIds: getRequiredStringFlag(ctx.flags, 'pty-ids').split(',') } : {}),
    ...(action === 'codex-forget-panes' ? { confirm: ctx.flags.get('confirm') === 'true' } : {})
  })
  printResult(await ctx.client.call('accounts.inspect', params), ctx.json, (result) =>
    JSON.stringify(result, null, 2)
  )
}

export const ACCOUNT_INSPECTION_HANDLERS: Record<string, CommandHandler> = {
  'account-inspect cursor-status': (ctx) => inspect(ctx, 'cursor-status'),
  'account-inspect grok-status': (ctx) => inspect(ctx, 'grok-status'),
  'account-inspect codex-sync-status': (ctx) => inspect(ctx, 'codex-sync-status'),
  'account-inspect codex-stale-panes': (ctx) => inspect(ctx, 'codex-stale-panes'),
  'account-inspect codex-recorded-lanes': (ctx) => inspect(ctx, 'codex-recorded-lanes'),
  'account-inspect codex-forget-panes': (ctx) => inspect(ctx, 'codex-forget-panes')
}
